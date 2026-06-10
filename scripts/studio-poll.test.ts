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
    const text = await callTool('get_tasks', { status: 'backlog' });
    expect(typeof text).toBe('string');
    expect(text).toContain('search-discovery');
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
});
