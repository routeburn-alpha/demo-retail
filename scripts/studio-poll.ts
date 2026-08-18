// studio-poll — bash-callable bridge to the studio-ai MCP server.
//
// agent-loop.sh runs OUTSIDE Claude Code, where the `mcp__studio-ai__*` tools are
// unavailable. The studio-ai MCP server is plain stateless HTTP (JSON-RPC over a
// one-shot SSE response), so this helper reaches it directly with `fetch` — keeping
// the loop's cheap-idle property (no Claude session just to check for work).
//
// CLI (prints "<product> <number>", or nothing when there is no work):
//   tsx scripts/studio-poll.ts next   [product]          → next backlog task (whole studio, or one product)
//   tsx scripts/studio-poll.ts resume <agent> [product]  → this agent's inProgress task to resume
//
// Token + agent + endpoint are resolved from the gitignored .claude/settings.local.json
// and .mcp.json, so the loop needs no extra wiring.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

function token(): string {
  const t = process.env.STUDIO_AI_TOKEN ?? settings().env?.STUDIO_AI_TOKEN;
  if (!t) throw new Error('STUDIO_AI_TOKEN not set (env or .claude/settings.local.json)');
  return t;
}

/** Whether a studio-ai token is resolvable — lets integration tests skip (not mock) when absent. */
export function hasCredentials(): boolean {
  return Boolean(process.env.STUDIO_AI_TOKEN ?? settings().env?.STUDIO_AI_TOKEN);
}

function agentName(): string {
  return process.env.AGENT_NAME ?? settings().env?.AGENT_NAME ?? 'unknown';
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

// `get_tasks` takes no `agent` argument — it accepts only productCode / taskNumbers / status /
// type, and silently drops unknown keys — so filtering by agent must happen here. The execution
// agent is the first bracket group after the task name:
//   `  #86: Make a British food related pack [managedSonnet] [owner: …] [reviewers: …]`
// Labelled groups are not agents, so a task with no execution agent yields null rather than
// borrowing its owner.
const AGENT_MARKER = /^\s*#\d+:.*?\[([^\]]+)\]/;
const LABELLED_MARKER = /^(owner|reviewers?):/;

/** The execution agent a `#N:` task line is attributed to, or null when it names none. */
function agentOf(line: string): string | null {
  const m = line.match(AGENT_MARKER);
  return m && !LABELLED_MARKER.test(m[1]) ? m[1] : null;
}

/** Parse a product-filtered get_tasks listing: the `#N:` headers belong to the given product. */
function tasksForProduct(text: string, product: string, agent?: string): StudioTask[] {
  const out: StudioTask[] = [];
  for (const line of text.split('\n')) {
    const task = line.match(TASK_LINE);
    if (task && (!agent || agentOf(line) === agent)) {
      out.push({ product, number: Number(task[1]) });
    }
  }
  return out;
}

/** Parse a studio-wide get_tasks listing, attributing each `#N:` to its product heading. */
function tasksStudioWide(text: string, agent?: string): StudioTask[] {
  const out: StudioTask[] = [];
  let current: string | null = null;
  for (const line of text.split('\n')) {
    const heading = line.match(PRODUCT_HEADING);
    if (heading) {
      current = heading[2];
      continue;
    }
    const task = line.match(TASK_LINE);
    if (task && current && (!agent || agentOf(line) === agent)) {
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

/** This agent's in-progress task (to resume) across the studio, or scoped to a product, or null. */
export async function resumeTask(agent: string, product?: string): Promise<StudioTask | null> {
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

async function main(): Promise<void> {
  const [, , cmd, a, b] = process.argv;
  let task: StudioTask | null;
  if (cmd === 'next') {
    task = await nextBacklogTask(a); // a = optional product filter
  } else if (cmd === 'resume') {
    task = await resumeTask(a ?? agentName(), b); // a = agent, b = optional product filter
  } else {
    console.error('usage: studio-poll.ts <next [product] | resume <agent> [product]>');
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
