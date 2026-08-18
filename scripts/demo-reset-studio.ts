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

/** A soft-deleted idea comes back from `search` as Archived — treat it as already reset,
 *  which is what makes a second run a no-op. */
const ALREADY_RESET = new Set(['archived']);

const DEFAULT_PRODUCT = 'search';

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

const ITEM_LINE = /^\s*(Idea|Task) #(\d+):\s*(.*)$/;

/**
 * Parse one `search` result line into an item.
 *
 * Lines look like:
 *   `  Idea #1071: Fuzzy search for typos (Archived) — matched: "…"`
 *   `  Task #1139: Implement fuzzy matching in search() (shipped) [idea #1069 — …]`
 *
 * The status is the LAST parenthesised group, but a name can itself end in `()` — hence
 * `[^()]+`, which cannot swallow `search()`.
 */
export function parseItemLine(line: string): { kind: 'Idea' | 'Task'; item: StudioItem } | null {
  const m = line.match(ITEM_LINE);
  if (!m) return null;

  const rest = m[3]
    .split(' — matched:')[0] // drop the search-snippet suffix
    .replace(/\s*\[[^\]]*\]\s*$/, ''); // drop the trailing [idea #N — …] annotation

  const withStatus = rest.match(/^(.*)\s\(([^()]+)\)\s*$/);
  if (!withStatus) return null;

  return {
    kind: m[1] as 'Idea' | 'Task',
    item: { number: Number(m[2]), name: withStatus[1].trim(), status: withStatus[2].trim() }
  };
}

/** Fuzzy-demo ideas/tasks that are still live (not already reset) and not protected. */
export async function discoverResettable(
  product: string = DEFAULT_PRODUCT
): Promise<{ ideas: StudioItem[]; tasks: StudioItem[] }> {
  const ideas = new Map<number, StudioItem>();
  const tasks = new Map<number, StudioItem>();

  // Several queries because `search` is a substring match — "fuzzy" alone misses an idea
  // titled only "Typo tolerance …". Results are unioned and de-duped by number.
  for (const query of ['fuzzy', 'typo', 'levenshtein']) {
    let text: string;
    try {
      text = await callTool('search', { productCode: product, query, limit: 50 });
    } catch {
      continue; // one failed query shouldn't blind the others
    }

    for (const line of text.split('\n')) {
      const parsed = parseItemLine(line);
      if (!parsed) continue;
      const { kind, item } = parsed;

      if (!FUZZY_NAME.test(item.name)) continue;
      if (ALREADY_RESET.has(item.status.toLowerCase())) continue;

      if (PROTECTED_NAME.test(item.name)) continue;

      if (kind === 'Idea') ideas.set(item.number, item);
      else tasks.set(item.number, item);
    }
  }

  return { ideas: [...ideas.values()], tasks: [...tasks.values()] };
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
      await callTool('delete_idea', { productCode: product, ideaNumber: idea.number });
      deletedIdeas.push(idea);
    } catch (e) {
      failed.push({ kind: 'idea', number: idea.number, reason: reason(e) });
    }
  }

  for (const task of tasks) {
    try {
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
