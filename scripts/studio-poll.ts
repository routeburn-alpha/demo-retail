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
//
// One channel it cannot intercept: Claude Code interpolates .mcp.json's X-Agent-Name header at
// session start, before any of this runs. That header is therefore *asserted* rather than
// resolved — see resolveMcpAgent() and assertAgentMatchesCheckout().

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

export function mcpUrl(): string {
  try {
    const cfg = JSON.parse(readFileSync(join(REPO_ROOT, '.mcp.json'), 'utf8'));
    return cfg.mcpServers['studio-ai'].url as string;
  } catch {
    return 'https://app.getpraxa.ai/api/mcp';
  }
}

const CREDENTIAL_KEYS = ['STUDIO_AI_TOKEN', 'AGENT_NAME', 'WORKTREE_AGENT_NAME'] as const;
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

/**
 * Whether a studio-ai token is resolvable — lets integration tests skip (not mock) when absent.
 *
 * Deliberately a **presence** check, not a validity check (platform #1124). Asking the server
 * whether the token still works would cost a network call at collection time and, worse, would turn
 * a rejected credential into a silent skip — the exact failure mode #1114 exists to eliminate, and
 * the opposite of what ARCHITECTURE.md §5 asks for (a missing secret must fail the job, not quietly
 * pass). So an invalid token still runs the suite and still fails it; only the diagnosis is made
 * instant, by studioErrorMessage() naming the credential instead of reporting a bare HTTP status.
 */
export function hasCredentials(): boolean {
  return Boolean(credential('STUDIO_AI_TOKEN'));
}

/**
 * Whether this checkout has a settings file to be bound by at all.
 *
 * Absent on CI and in a fresh clone, where the file is gitignored. The tests that assert the
 * binding skip on that (standards/no-mocks.md — skip, never fake), and they ask here rather than
 * reading the file themselves: a gitignored file must never be a precondition for the suite
 * *loading*, only for the handful of assertions that need one.
 */
export function hasWorktreeSettings(): boolean {
  return settings().env !== undefined;
}

/**
 * What this worktree's settings file configures for `key`, ignoring the ambient shell entirely.
 *
 * `credential()` is the resolved answer; this is one of its two inputs, exported so a test can
 * assert which input won without re-implementing the file lookup. Undefined — never a throw —
 * when there is no settings file, so it is safe to call before `hasWorktreeSettings()` is known.
 */
export function configuredCredential(key: CredentialKey): string | undefined {
  return settingsEnv()?.[key];
}

/**
 * This worktree's whole `env` block, ignoring the ambient shell.
 *
 * `.mcp.json` interpolates against a *set* of variables rather than one key, so the header resolver
 * needs the block itself. Undefined — never a throw — when there is no settings file.
 */
export function settingsEnv(): Record<string, string> | undefined {
  return settings().env;
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
  return tokenClaims()?.studioCode;
}

/** The claims of the resolved token that are safe to name in an error: never the token itself. */
export interface TokenClaims {
  studioCode?: string;
  /** Expiry, in seconds since the epoch — the JWT `exp` convention. */
  exp?: number;
}

/**
 * The resolved token's own claims, or undefined when there is no token or it is not a readable JWT.
 *
 * Only `studioCode` and `exp` are surfaced. Both are safe to print, and between them they answer the
 * two questions a rejection raises: was this token for the right studio, and has it simply run out?
 */
export function tokenClaims(): TokenClaims | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token().split('.')[1], 'base64url').toString());
    return {
      studioCode: typeof payload.studioCode === 'string' ? payload.studioCode : undefined,
      exp: typeof payload.exp === 'number' ? payload.exp : undefined
    };
  } catch {
    return undefined;
  }
}

/**
 * A studio-ai call refused because the credential was rejected, not because the work was absent.
 *
 * Its own type because the poll paths deliberately swallow failures — to agent-loop.sh, "no tasks"
 * and "endpoint unreachable" are both just "nothing to pick up". A dead token must not land in that
 * bucket, or the loop idles politely forever against a credential nobody has noticed expired.
 */
export class CredentialRejected extends Error {}

/** Statuses that mean "your credential was refused" rather than "the call went wrong". */
const REJECTED_CREDENTIAL = new Set([401, 403]);

/**
 * Turn a failed studio-ai response into a message that names its actual cause.
 *
 * A stale token used to surface as `studio-ai HTTP 401`, which reads as a regression in whatever
 * change is under test — it cost a real debugging detour on 2026-08-18. Pure: status, body and
 * claims are all passed in, so this is I/O-free and testable without a service.
 *
 * The server body is deliberately dropped for credential failures: it can quote the rejected
 * credential back, and nothing here may print a token value. Every other status keeps it.
 */
export function studioErrorMessage(status: number, body: string, claims?: TokenClaims): string {
  if (!REJECTED_CREDENTIAL.has(status)) return `studio-ai HTTP ${status}: ${body}`;

  let detail: string;
  if (!claims) {
    detail = 'The configured token could not be read as a JWT.';
  } else {
    const studio = claims.studioCode ? `opens studio "${claims.studioCode}"` : 'names no studio';
    const expiry =
      claims.exp === undefined
        ? 'and carries no expiry, so it was likely revoked'
        : claims.exp * 1000 < Date.now()
          ? `and expired on ${new Date(claims.exp * 1000).toISOString()}`
          : `and is valid until ${new Date(claims.exp * 1000).toISOString()}, so it was likely revoked ` +
            `or issued for a different studio`;
    detail = `The token ${studio} ${expiry}.`;
  }

  return (
    `studio-ai rejected the configured STUDIO_AI_TOKEN (HTTP ${status}). This is a credential ` +
    `problem, not a failure of the code under test. ${detail} Refresh it in ` +
    `.claude/settings.local.json, then re-run.`
  );
}

/** The error a failed studio-ai response should raise — typed so callers can tell the causes apart. */
export function studioError(status: number, body: string, claims?: TokenClaims): Error {
  const message = studioErrorMessage(status, body, claims);
  return REJECTED_CREDENTIAL.has(status) ? new CredentialRejected(message) : new Error(message);
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

/**
 * The `X-Agent-Name` template `.mcp.json` carries, uninterpolated (e.g. `"${WORKTREE_AGENT_NAME}"`).
 *
 * Read rather than assumed: `.mcp.json` is tracked and shared by the whole fleet, so this file is
 * the one place the header's binding is declared, and a test must be able to catch it drifting back
 * to a variable the shell can reach.
 */
export function mcpAgentTemplate(): string | undefined {
  try {
    const cfg = JSON.parse(readFileSync(join(REPO_ROOT, '.mcp.json'), 'utf8'));
    return cfg.mcpServers['studio-ai'].headers['X-Agent-Name'] as string;
  } catch {
    return undefined;
  }
}

/**
 * The agent name the MCP header will actually carry, by Claude Code's own precedence rules.
 *
 * Claude Code interpolates `.mcp.json` at session start, before anything in this repo runs — so
 * unlike every other path, this one cannot be corrected from inside `credential()`. Its settings
 * `env` block *fills* variables that are unset but does **not** override one inherited from the
 * launching shell, which is why `${AGENT_NAME}` kept resolving to whichever agent's terminal opened
 * the session. Pure, and the two envs are passed in, so the leak is testable from one process.
 */
export function resolveMcpAgent(
  template: string | undefined,
  configured: Record<string, string> | undefined,
  ambient: Record<string, string | undefined>
): string | undefined {
  if (!template) return undefined;
  const variable = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(template.trim());
  if (!variable) return template.trim() || undefined; // a literal name, already unambiguous
  return ambient[variable[1]] ?? configured?.[variable[1]];
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
 * has `arcteryx` and `prana` both registered, so a name inherited from another worktree's shell is
 * a *valid* agent and nothing downstream rejects it. Two independent witnesses — the settings file
 * and the checkout — must agree, or nothing runs.
 */
export function assertAgentMatchesCheckout(): void {
  const configured = agentName();
  const implied = checkoutAgentHere();
  if (!implied) return; // the main worktree implies no agent at all — nothing to disagree with

  if (configured !== implied) {
    const source = settingsEnv()?.AGENT_NAME === undefined ? 'the environment' : '.claude/settings.local.json';
    throw new Error(
      `agent identity mismatch: ${source} says "${configured}", but this checkout says "${implied}". ` +
        `Both may be registered agents, so this cannot be resolved automatically — fix the settings ` +
        `file or work in the right worktree.`
    );
  }

  // The MCP header is checked separately because it is resolved by Claude Code, not by us: agreeing
  // settings are not enough if .mcp.json still names a variable the launching shell can reach.
  const header = resolveMcpAgent(mcpAgentTemplate(), settingsEnv(), process.env);
  if (header !== implied) {
    throw new Error(
      `MCP agent identity mismatch: .mcp.json's X-Agent-Name resolves to ` +
        `${header ? `"${header}"` : 'nothing'}, but this checkout says "${implied}". Claude Code ` +
        `interpolates that header at session start and work_on_next_task has no agentName parameter, ` +
        `so a task claimed now would be recorded against the wrong agent with no way to correct it. ` +
        `Set WORKTREE_AGENT_NAME in .claude/settings.local.json, and make sure no shell exports it.`
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
  if (!res.ok) throw studioError(res.status, await res.text(), tokenClaims());

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
  } catch (e) {
    if (e instanceof CredentialRejected) throw e; // a dead token is not "no tasks"
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
  } catch (e) {
    if (e instanceof CredentialRejected) throw e; // a dead token is not "no work to resume"
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
