import { describe, it, expect } from 'vitest';
import { callTool, nextBacklogTask, resumeTask, hasCredentials } from './studio-poll';

// Integration tests — these hit the REAL studio-ai MCP HTTP endpoint (no mocks),
// per standards/no-mocks.md. Token + agent are self-resolved from
// .claude/settings.local.json by the helper. Assertions are shape-based so they
// don't flake as studio task state changes between runs.
// Skipped (never mocked) when no token is available — e.g. a fresh checkout or CI
// without the gitignored settings.local.json.

const isTask = (r: { product: string; number: number } | null) =>
  r === null ||
  (typeof r.product === 'string' && r.product.length > 0 && Number.isInteger(r.number) && r.number > 0);

describe.skipIf(!hasCredentials())('studio-poll (real studio-ai MCP over HTTP)', () => {
  it('callTool reaches the live MCP endpoint studio-wide', async () => {
    // callTool throws on HTTP or JSON-RPC failure, so a returned payload already proves the
    // endpoint answered. Assert the studio-wide listing shape — a `Product Name (code):`
    // heading — rather than a specific studio slug, which varies with the connected studio.
    const text = await callTool('get_tasks', { status: 'backlog' });
    expect(typeof text).toBe('string');
    expect(text).toMatch(/^\S[^()]*? \([a-z0-9_-]+\):\s*$/m);
  });

  it('nextBacklogTask (studio-wide) returns {product, number} or null', async () => {
    expect(isTask(await nextBacklogTask())).toBe(true);
  });

  it('nextBacklogTask(product) stays within the requested product', async () => {
    const r = await nextBacklogTask('platform');
    expect(r === null || r.product === 'platform').toBe(true);
  });

  it('resumeTask(agent) returns {product, number} or null for this agent', async () => {
    expect(isTask(await resumeTask('prana'))).toBe(true);
  });

  // `get_tasks` has no `agent` parameter — the server ignores unknown keys, so filtering by
  // agent has to happen client-side off the `[agentName]` marker in each task line. Both tests
  // below skip themselves when the studio has no in-progress work rather than asserting on an
  // empty listing.
  it('resumeTask(agent) returns null for an agent with no in-progress work', async () => {
    const listing = await callTool('get_tasks', { status: 'inProgress' });
    if (!/^\s*#\d+:/m.test(listing)) return; // nothing in progress studio-wide — nothing to filter
    expect(await resumeTask('no-such-agent-1f4b9c')).toBeNull();
  });

  it('resumeTask(agent) only returns a task whose execution agent is that agent', async () => {
    const listing = await callTool('get_tasks', { status: 'inProgress' });
    const agent = listing.match(/^\s*#\d+:.*?\[([^\]]+)\]/m)?.[1];
    if (!agent || agent.startsWith('owner:')) return; // no agent-attributed task to check against
    const r = await resumeTask(agent);
    expect(r).not.toBeNull();
    expect(listing).toMatch(new RegExp(`^\\s*#${r!.number}:.*?\\[${agent}\\]`, 'm'));
  });
});
