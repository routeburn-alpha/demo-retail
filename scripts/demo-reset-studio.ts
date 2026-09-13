// demo-reset-studio — the Studio half of the fuzzy-search demo reset.
//
// scripts/demo-reset.sh restores the CODE to the `demo-baseline/search-exact` tag, but the
// Studio task store lives behind the studio-ai MCP server and is unreachable from a shell.
// This is the Node half: it finds the ideas/tasks a fuzzy-search demo run created and
// soft-deletes them, so the next replay starts from a clean slate.
//
// Discover-and-delete (rather than resetting a hardcoded manifest) works because the slate
// was purged once: any fuzzy-named idea/task that exists is, by definition, from a demo run.
// It also sidesteps the transition rules — `shipped -> backlog` is rejected by the backend,
// but a shipped task can still be deleted.
//
// CLI:
//   tsx scripts/demo-reset-studio.ts              → dry-run: print what would be deleted
//   tsx scripts/demo-reset-studio.ts --apply      → perform the soft-deletes
//   tsx scripts/demo-reset-studio.ts --product X  → scope to a product (default: search)

import { callTool, hasCredentials } from './studio-poll';

/** Matched against the item NAME only. Body matching is far too broad — most search ideas
 *  mention "fuzzy" somewhere in their prose without being fuzzy-search work. */
const FUZZY_NAME = /fuzzy|typo|levenshtein|edit\s*distance/i;

/**
 * Never delete the cleanup work itself. #1147's NAME contains "fuzzy-search", so without this
 * guard the reset would delete the very task that established the baseline.
 *
 * Matched on NAME, deliberately not on number: Studio **recycles the numbers of soft-deleted
 * items**. A freshly created demo idea was observed being assigned #2 — the number of an idea
 * soft-deleted minutes earlier. A number-based allowlist would therefore drift onto whatever
 * record later inherits that number, protecting the wrong thing and leaving demo debris behind.
 *
 * The broader search ideas (#1 semantic, #3 zero-results, #4/#6 synonym, #5 BERT, #7 Demo
 * Showcase, #9 synonym spike) need no entry here — none of their names match FUZZY_NAME, so
 * discovery already excludes them.
 */
export const PROTECTED_NAME = /demo[-\s]?reset|search baseline/i;

/** Belt and braces: the queryless listings below already exclude archived records, but an
 *  archived idea still prints its status, so drop it explicitly rather than relying on that. */
const ALREADY_RESET = new Set(['archived']);

const DEFAULT_PRODUCT = 'search';

/** Overwritten into an artefact's text before it is deleted. See `scrub()`. */
const SCRUBBED =
  'Archived demo artefact. Content cleared so it cannot surface in demo search results.';

export interface StudioItem {
  number: number;
  name: string;
  status: string;
}

export interface ResetFailure {
  kind: 'idea' | 'task';
  number: number;
  reason: string;
}

export interface ResetResult {
  /** Dry-run: what would be deleted. Applied: what actually was. */
  ideas: StudioItem[];
  tasks: StudioItem[];
  failed: ResetFailure[];
  applied: boolean;
}

export interface ResetOptions {
  product?: string;
  apply?: boolean;
  /** Restrict to specific numbers. When set, anything not listed is left alone — this is how
   *  the integration tests mutate only their own fixture and never real studio state. */
  only?: { ideas?: number[]; tasks?: number[] };
}

const ITEM_LINE = /^\s*#(\d+):\s*(.*)$/;

/**
 * Parse one `get_ideas` / `get_tasks` result line into an item.
 *
 * Lines look like:
 *   idea: `  #1115: Support typo tolerance in search (Archived) [owner: Cassandra Shum]`
 *   task: `  #1161: Implement fuzzy matching in search() [managedHaiku] [owner: C S] (Idea #1110: …)`
 *
 * Tasks carry no status in this listing, so `status` is '' for them. That is not lossy: the
 * queryless listing returns only live records, so there is no archived task to filter out.
 *
 * For an idea the status is the LAST parenthesised group, but a name can itself end in `()` —
 * hence `[^()]+`, which cannot swallow `search()`.
 */
export function parseItemLine(line: string, kind: 'Idea' | 'Task'): StudioItem | null {
  const m = line.match(ITEM_LINE);
  if (!m) return null;

  // A task's trailing `(Idea #N: …)` annotation, then any number of `[agent]` / `[owner: …]`.
  let rest = m[2].replace(/\s*\(Idea #\d+:[^)]*\)\s*$/, '');
  const TRAILING_BRACKET = /\s*\[[^\]]*\]\s*$/;
  while (TRAILING_BRACKET.test(rest)) rest = rest.replace(TRAILING_BRACKET, '');

  if (kind === 'Task') return { number: Number(m[1]), name: rest.trim(), status: '' };

  const withStatus = rest.match(/^(.*)\s\(([^()]+)\)\s*$/);
  if (!withStatus) return null;
  return { number: Number(m[1]), name: withStatus[1].trim(), status: withStatus[2].trim() };
}

/**
 * Every line of a product's full listing, following `Next cursor:` to the end.
 *
 * Deliberately QUERYLESS. The previous implementation called a `search` tool that the studio-ai
 * server does not expose — the call errored, `discoverResettable` swallowed it per-query, and so
 * discovery returned nothing forever while the reset cheerfully reported "already clean". That is
 * why the Studio half silently stopped working. Queryless `get_ideas` / `get_tasks` also return
 * only LIVE records, which is exactly what a reset wants: an archived artefact is already reset,
 * and query-backed search would drag every one of them back in.
 *
 * Errors now propagate — `main()` turns them into a visible warning plus the manual checklist,
 * which is the failure mode that should have happened the first time.
 */
async function listAll(tool: 'get_ideas' | 'get_tasks', product: string): Promise<string[]> {
  const lines: string[] = [];
  let cursor: string | undefined;

  // Bounded so a malformed cursor cannot spin forever. 100 records a page — no demo product is
  // remotely near the 1000 that ten pages allow.
  for (let page = 0; page < 10; page++) {
    const args: Record<string, unknown> = { productCode: product, pageSize: 100 };
    if (cursor) args.cursor = cursor;

    const text = await callTool(tool, args);
    lines.push(...text.split('\n'));

    const next = text.match(/^Next cursor:\s*(\S+)\s*$/m);
    if (!next) break;
    cursor = next[1];
  }
  return lines;
}

/** Fuzzy-demo ideas/tasks that are still live (not already reset) and not protected. */
export async function discoverResettable(
  product: string = DEFAULT_PRODUCT
): Promise<{ ideas: StudioItem[]; tasks: StudioItem[] }> {
  const ideas: StudioItem[] = [];
  const tasks: StudioItem[] = [];

  for (const [tool, kind, out] of [
    ['get_ideas', 'Idea', ideas],
    ['get_tasks', 'Task', tasks]
  ] as const) {
    for (const line of await listAll(tool, product)) {
      const item = parseItemLine(line, kind);
      if (!item) continue;

      if (!FUZZY_NAME.test(item.name)) continue;
      if (ALREADY_RESET.has(item.status.toLowerCase())) continue;
      if (PROTECTED_NAME.test(item.name)) continue;

      out.push(item);
    }
  }

  return { ideas, tasks };
}

/**
 * Blank an artefact's text before it is deleted.
 *
 * `delete_idea` / `delete_task` are SOFT deletes: the record survives as Archived, and archived
 * records are still returned by the Knowledge-backed search the demo chat uses. Deleting alone
 * therefore left every run's fuzzy artefacts in the demo's search results forever, and the pile
 * only ever grew. Overwriting the name and body first means the remnant matches nothing.
 */
async function scrub(product: string, kind: 'idea' | 'task', item: StudioItem): Promise<void> {
  const name = `Archived demo artefact ${item.number}`;
  if (kind === 'idea') {
    await callTool('update_idea', {
      productCode: product,
      ideaNumber: item.number,
      name,
      hypothesis: SCRUBBED,
      technicalDesign: SCRUBBED
    });
  } else {
    await callTool('update_task', {
      productCode: product,
      taskNumber: item.number,
      name,
      specification: SCRUBBED
    });
  }
}

/** Discover, then (with `apply`) soft-delete. Idempotent: a second run finds nothing. */
export async function resetStudio(opts: ResetOptions = {}): Promise<ResetResult> {
  const product = opts.product ?? DEFAULT_PRODUCT;
  const apply = opts.apply ?? false;

  const found = await discoverResettable(product);
  let { ideas, tasks } = found;

  if (opts.only) {
    const onlyIdeas = opts.only.ideas ?? [];
    const onlyTasks = opts.only.tasks ?? [];
    ideas = ideas.filter((i) => onlyIdeas.includes(i.number));
    tasks = tasks.filter((t) => onlyTasks.includes(t.number));
  }

  if (!apply) return { ideas, tasks, failed: [], applied: false };

  const failed: ResetFailure[] = [];
  const deletedIdeas: StudioItem[] = [];
  const deletedTasks: StudioItem[] = [];
  const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

  for (const idea of ideas) {
    try {
      await scrub(product, 'idea', idea);
      await callTool('delete_idea', { productCode: product, ideaNumber: idea.number });
      deletedIdeas.push(idea);
    } catch (e) {
      failed.push({ kind: 'idea', number: idea.number, reason: reason(e) });
    }
  }

  for (const task of tasks) {
    try {
      await scrub(product, 'task', task);
      await callTool('delete_task', { productCode: product, taskNumber: task.number });
      deletedTasks.push(task);
    } catch (e) {
      failed.push({ kind: 'task', number: task.number, reason: reason(e) });
    }
  }

  return { ideas: deletedIdeas, tasks: deletedTasks, failed, applied: true };
}

/** Printed when Studio can't be reached — the reset must never fail the whole demo. */
const MANUAL_CHECKLIST = `  Studio not reset automatically. By hand:
    • Delete the fuzzy-search idea and its tasks created by the last run.
    • Confirm the praxaai Vercel production storefront (main) is unchanged.`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const productFlag = argv.indexOf('--product');
  const product = productFlag >= 0 ? argv[productFlag + 1] : DEFAULT_PRODUCT;

  if (!hasCredentials()) {
    console.log('⚠ No STUDIO_AI_TOKEN — skipping the Studio reset.');
    console.log(MANUAL_CHECKLIST);
    return; // exit 0: a missing token must not fail the code reset
  }

  let result: ResetResult;
  try {
    result = await resetStudio({ product, apply });
  } catch (e) {
    console.log(`⚠ Studio unreachable (${e instanceof Error ? e.message : String(e)}).`);
    console.log(MANUAL_CHECKLIST);
    return;
  }

  const total = result.ideas.length + result.tasks.length;
  if (total === 0) {
    console.log('✓ Studio already clean — no fuzzy-search demo artifacts to remove.');
  } else {
    const verb = result.applied ? 'Deleted' : 'Would delete';
    for (const i of result.ideas) console.log(`  ${verb} idea #${i.number}: ${i.name} (${i.status})`);
    for (const t of result.tasks) console.log(`  ${verb} task #${t.number}: ${t.name} (${t.status})`);
    console.log(
      result.applied
        ? `✓ Studio reset — removed ${total} fuzzy-search demo artifact(s).`
        : `▸ Dry-run: ${total} artifact(s) would be removed. Re-run with --apply.`
    );
  }

  for (const f of result.failed) {
    console.log(`⚠ Could not delete ${f.kind} #${f.number}: ${f.reason}`);
  }
}

// Run the CLI only when invoked directly (not when imported by the test).
if (process.argv[1]?.endsWith('demo-reset-studio.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
