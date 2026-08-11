// studio-poll — bash-callable bridge to the studio-ai MCP server.
//
// agent-loop.sh runs OUTSIDE Claude Code, where the `mcp__studio-ai__*` tools are
// unavailable. The studio-ai MCP server is plain stateless HTTP (JSON-RPC over a
// one-shot SSE response), so this helper reaches it directly with `fetch` — keeping
// the loop's cheap-idle property (no Claude session just to check for work).
//
// CLI (prints "<product> <number>", or nothing when there is no work):
//   tsx scripts/studio-poll.ts next   [product]   → next backlog task (whole studio, or one product)
//   tsx scripts/studio-poll.ts resume [product]   → this agent's inProgress task to resume
//   tsx scripts/studio-poll.ts whoami             → "<agent> <studio>"; nonzero if unresolvable
//
// Token + agent + endpoint are resolved from the gitignored .claude/settings.local.json
// and .mcp.json, so the loop needs no extra wiring. This module is the SINGLE authority on
// that binding — agent-loop.sh asks it via `whoami` rather than reading the environment
// itself, so the shell cannot disagree with the worktree about who this agent is.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function settings(): { env?: Record<string, string> } {
  try {
    return JSON.parse(readFileSync(join(REPO_ROOT, '.claude/settings.local.json'), 'utf8'));
  } catch {
    return {};
  }
}

function mcpUrl(): string {
  try {
    const cfg = JSON.parse(readFileSync(join(REPO_ROOT, '.mcp.json'), 'utf8'));
    return cfg.mcpServers['studio-ai'].url as string;
  } catch {
    return 'https://app.getpraxa.ai/api/mcp';
  }
}

const CREDENTIAL_KEYS = ['STUDIO_AI_TOKEN', 'AGENT_NAME'] as const;
type CredentialKey = (typeof CREDENTIAL_KEYS)[number];

// The worktree's own settings file wins over the ambient shell. Each agent worktree is bound to a
// studio and an agent name by `worktree-init.sh`; an inherited export (a STUDIO_AI_TOKEN in
// ~/.zshenv, say) would otherwise silently repoint the loop at another studio under another
// agent's name. Env remains the fallback so CI can supply credentials without a settings file.
function credential(key: CredentialKey): string | undefined {
  return settings().env?.[key] ?? process.env[key];
}

/**
 * Keys where the ambient shell disagrees with this worktree's settings file. The settings file
 * still wins — resolution is never ambiguous — but a disagreement means somebody's mental model
 * of this checkout is wrong, so `whoami` prints it rather than letting it stay invisible. (That
 * is how this class of bug hid: a `~/.zshenv` export bound to another studio, silently obeyed.)
 */
export function conflictingCredentials(): CredentialKey[] {
  const configured = settings().env ?? {};
  return CREDENTIAL_KEYS.filter(
    (k) => configured[k] !== undefined && process.env[k] !== undefined && process.env[k] !== configured[k]
  );
}

function token(): string {
  const t = credential('STUDIO_AI_TOKEN');
  if (!t) throw new Error('STUDIO_AI_TOKEN not set (.claude/settings.local.json or env)');
  return t;
}

/** Whether a studio-ai token is resolvable — lets integration tests skip (not mock) when absent. */
export function hasCredentials(): boolean {
  return Boolean(credential('STUDIO_AI_TOKEN'));
}

/** The agent this worktree is bound to. Exported so the binding itself is testable. */
export function agentName(): string {
  return credential('AGENT_NAME') ?? 'unknown';
}

/**
 * The studio the resolved token belongs to, read from its own `studioCode` claim.
 *
 * This is the binding assertable at its source: the token says which studio it opens, so nothing
 * has to infer it from the wording of a live response. Undefined when there is no token or it is
 * not a readable JWT — callers decide whether that is fatal.
 */
export function studioCode(): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token().split('.')[1], 'base64url').toString());
    return typeof payload.studioCode === 'string' ? payload.studioCode : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The agent a checkout says it is, from the checkout itself rather than from any configuration:
 * the `agent/<name>` branch when one is checked out, else the worktree directory's `<repo>-<name>`
 * suffix, which survives the short-lived PR branches. Undefined in the main worktree, which implies
 * no agent at all. Pure — the git values are passed in, so it is testable without a fixture repo.
 */
export function checkoutAgent(branch: string, worktreeName: string, repoName: string): string | undefined {
  const onAgentBranch = /^agent\/(.+)$/.exec(branch);
  if (onAgentBranch) return onAgentBranch[1];
  return worktreeName.startsWith(`${repoName}-`) ? worktreeName.slice(repoName.length + 1) : undefined;
}

/** Ask git what this checkout is. Undefined when git cannot be consulted (not a worktree, no git). */
function checkoutAgentHere(): string | undefined {
  try {
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const commonDir = git('rev-parse', '--path-format=absolute', '--git-common-dir');
    return checkoutAgent(git('rev-parse', '--abbrev-ref', 'HEAD'), basename(REPO_ROOT), basename(dirname(commonDir)));
  } catch {
    return undefined;
  }
}

/**
 * Stop when the resolved agent name disagrees with the checkout it is running in.
 *
 * This is the backstop that makes a leak impossible to obey rather than merely unlikely: the studio
 * has `arcterx`, `arcteryx` and `prana` all registered, so a name inherited from another worktree's
 * shell is a *valid* agent and nothing downstream rejects it. Two independent witnesses — the
 * settings file and the checkout — must agree, or nothing runs.
 */
export function assertAgentMatchesCheckout(): void {
  const configured = agentName();
  const implied = checkoutAgentHere();
  if (implied && configured !== implied) {
    const source = settings().env?.AGENT_NAME === undefined ? 'the environment' : '.claude/settings.local.json';
    throw new Error(
      `agent identity mismatch: ${source} says "${configured}", but this checkout says "${implied}". ` +
        `Both may be registered agents, so this cannot be resolved automatically — fix the settings ` +
        `file or work in the right worktree.`
    );
  }
}

/** Call a studio-ai MCP tool over HTTP and return its text content. Throws on transport / JSON-RPC error. */
export async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const res = await fetch(mcpUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'X-Agent-Name': agentName(),
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args }
    })
  });
  if (!res.ok) throw new Error(`studio-ai HTTP ${res.status}: ${await res.text()}`);

  // The response is a single SSE event; the JSON-RPC payload is on the `data:` line(s).
  const body = await res.text();
  const data = body
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => l.slice('data: '.length))
    .join('');
  const rpc = JSON.parse(data);
  if (rpc.error) throw new Error(`studio-ai error: ${JSON.stringify(rpc.error)}`);
  return (rpc.result?.content ?? []).map((c: { text?: string }) => c.text ?? '').join('\n');
}

export interface StudioTask {
  product: string;
  number: number;
}

// `get_tasks` text shapes:
//  - product-filtered: status sub-groups then `  #N:` task lines (product is known).
//  - studio-wide:      a `Product Name (code):` heading (column 0) per product, then `  #N:` lines.
const PRODUCT_HEADING = /^(\S[^()]*?) \(([a-z0-9_-]+)\):\s*$/;
const TASK_LINE = /^\s*#(\d+):/;

/**
 * Whether a `#N:` listing line is assigned to `agent`, which studio-ai renders as an `[agent]`
 * marker after the title.
 *
 * Ownership has to be decided here because the server **ignores the `agent:` request filter** —
 * verified against the live endpoint, and .claude/skills/work-on-task/SKILL.md:43 says the same.
 * Trusting that filter means one agent's loop resuming whatever another agent is mid-way through,
 * which is precisely what the one-worktree-per-agent model exists to prevent.
 */
function ownedBy(line: string, agent: string): boolean {
  return line.includes(`[${agent}]`);
}

/**
 * Parse a product-filtered get_tasks listing: the `#N:` headers belong to the given product.
 * Pass `agent` to keep only that agent's tasks. Exported for the pure parser test.
 */
export function tasksForProduct(text: string, product: string, agent?: string): StudioTask[] {
  const out: StudioTask[] = [];
  for (const line of text.split('\n')) {
    const task = line.match(TASK_LINE);
    if (task && (!agent || ownedBy(line, agent))) out.push({ product, number: Number(task[1]) });
  }
  return out;
}

/**
 * Parse a studio-wide get_tasks listing, attributing each `#N:` to its product heading.
 * Pass `agent` to keep only that agent's tasks. Exported for the pure parser test.
 */
export function tasksStudioWide(text: string, agent?: string): StudioTask[] {
  const out: StudioTask[] = [];
  let current: string | null = null;
  for (const line of text.split('\n')) {
    const heading = line.match(PRODUCT_HEADING);
    if (heading) {
      current = heading[2];
      continue;
    }
    const task = line.match(TASK_LINE);
    if (task && current && (!agent || ownedBy(line, agent))) {
      out.push({ product: current, number: Number(task[1]) });
    }
  }
  return out;
}

/** Discover backlog tasks; pass a product to scope to it, omit to scan the whole studio. */
async function backlogTasks(product?: string): Promise<StudioTask[]> {
  try {
    if (product) {
      const text = await callTool('get_tasks', { productCode: product, status: 'backlog' });
      return tasksForProduct(text, product);
    }
    return tasksStudioWide(await callTool('get_tasks', { status: 'backlog' }));
  } catch {
    return []; // no tasks / unreachable → nothing to pick up
  }
}

/** The next backlog task to pick up — first in the studio's listing order — or null. */
export async function nextBacklogTask(product?: string): Promise<StudioTask | null> {
  const tasks = await backlogTasks(product);
  return tasks[0] ?? null;
}

/**
 * This agent's in-progress task (to resume) across the studio, or scoped to a product, or null.
 *
 * The agent is resolved here, never passed in: identity is a property of the worktree, not an
 * argument the caller gets to choose. agent-loop.sh used to forward its own `$AGENT_NAME`, which
 * meant an ambient export bypassed the binding entirely and this agent silently stopped finding
 * its own in-progress work.
 */
export async function resumeTask(product?: string): Promise<StudioTask | null> {
  const agent = agentName();
  // No `agent:` in the request — the server ignores it (see ownedBy). Ownership is applied to the
  // listing instead, so this really does return only this agent's work.
  try {
    if (product) {
      const text = await callTool('get_tasks', { productCode: product, status: 'inProgress' });
      return tasksForProduct(text, product, agent)[0] ?? null;
    }
    return tasksStudioWide(await callTool('get_tasks', { status: 'inProgress' }), agent)[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Print this worktree's identity, or fail. agent-loop.sh runs this once before polling, so a
 * checkout that cannot say who it is stops at the door instead of quietly polling as `unknown`.
 * Conflicts are reported here and only here: the poll subcommands run every 30s and would turn
 * the warning into noise the operator learns to ignore.
 */
function whoami(): void {
  const agent = agentName();
  const studio = studioCode();
  for (const key of conflictingCredentials()) {
    console.error(`warning: ${key} differs between the shell and .claude/settings.local.json; using the settings value`);
  }
  try {
    assertAgentMatchesCheckout();
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
  if (agent === 'unknown' || !studio) {
    console.error('identity unresolvable — expected AGENT_NAME and STUDIO_AI_TOKEN in .claude/settings.local.json');
    process.exit(1);
  }
  console.log(`${agent} ${studio}`);
}

async function main(): Promise<void> {
  const [, , cmd, a] = process.argv;
  if (cmd === 'whoami') return whoami();

  let task: StudioTask | null;
  if (cmd === 'next') {
    task = await nextBacklogTask(a); // a = optional product filter
  } else if (cmd === 'resume') {
    task = await resumeTask(a); // a = optional product filter
  } else {
    console.error('usage: studio-poll.ts <next [product] | resume [product] | whoami>');
    process.exit(2);
  }
  if (task) console.log(`${task.product} ${task.number}`);
}

// Run the CLI only when invoked directly (not when imported by the test).
if (process.argv[1]?.endsWith('studio-poll.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
