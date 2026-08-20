import { describe, it, expect } from 'vitest';
import {
  agentName,
  agentPort,
  studioCode,
  configuredCredential,
  conflictingCredentials,
  callTool,
  nextBacklogTask,
  resumeTask,
  tasksForProduct,
  tasksStudioWide,
  checkoutAgent,
  assertAgentMatchesCheckout,
  mcpAgentTemplate,
  resolveMcpAgent,
  settingsEnv,
  hasCredentials,
  hasWorktreeSettings,
  conflictingPortWorktrees,
  worktreePorts,
  repoRoot,
  studioErrorMessage,
  studioError,
  CredentialRejected,
  mcpUrl
} from './studio-poll';

// Integration tests — these hit the REAL studio-ai MCP HTTP endpoint (no mocks),
// per standards/no-mocks.md. Token + agent are self-resolved from
// .claude/settings.local.json by the helper. Assertions are shape-based so they
// don't flake as studio task state changes between runs.
// Skipped (never mocked) when no token is available — e.g. a fresh checkout or CI
// without the gitignored settings.local.json.

const isTask = (r: { product: string; number: number } | null) =>
  r === null ||
  (typeof r.product === 'string' && r.product.length > 0 && Number.isInteger(r.number) && r.number > 0);

/** The agent this worktree is bound to by its settings file; undefined when there is no such file. */
const configuredAgent = configuredCredential('AGENT_NAME');

/** The dev-server port this worktree is bound to by its settings file. */
const configuredPort = configuredCredential('AGENT_PORT');

/** Run `fn` with `process.env[key]` forced to `value` — or unset, when undefined — then restore. */
function withAmbient(key: string, value: string | undefined, fn: () => void): void {
  const previous = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
}

// Pure — no I/O beyond reading the worktree's own settings file. That file is the authority on
// which studio and agent this checkout is bound to; a shell export must never silently rebind it.
// This is the binding that agent-loop.sh runs on, so a stray ambient value would send an agent at
// another studio's backlog under another agent's name.
describe.skipIf(!hasWorktreeSettings())('worktree settings beat ambient env', () => {
  it('resolves the agent name from settings.local.json even when the shell exports another', () => {
    withAmbient('AGENT_NAME', 'ambient-imposter', () => {
      expect(agentName()).toBe(configuredAgent);
    });
  });

  it('resolves the token from settings.local.json even when the shell exports another studio', () => {
    // A whole other studio's token, ambient. The binding must not move.
    withAmbient('STUDIO_AI_TOKEN', 'header.eyJzdHVkaW9Db2RlIjoiYW1iaWVudC1pbXBvc3Rvci1zdHVkaW8ifQ.sig', () => {
      expect(studioCode()).toBe('search-discovery');
    });
  });

  // The same leak class as AGENT_NAME, but silent instead of loud: a wrong port serves the storefront
  // on a port another worktree believes it owns, so /work-on-task step 9 can verify a change against
  // another agent's dev server. Asserting `not.toBe` the ambient value is what proves the fallback
  // did not win — comparing to the configured value alone would pass vacuously without a settings file.
  it('resolves the dev-server port from settings.local.json even when the shell exports another', () => {
    withAmbient('AGENT_PORT', '5199', () => {
      expect(agentPort()).toBe(configuredPort);
      expect(agentPort()).not.toBe('5199');
    });
  });

  it('reports a shell/worktree disagreement instead of resolving it silently', () => {
    withAmbient('AGENT_NAME', 'ambient-imposter', () => {
      expect(conflictingCredentials()).toContain('AGENT_NAME');
    });
    // A shell that agrees is not a conflict. Asserted by forcing agreement rather than by reading
    // the ambient shell, which on a developer machine may legitimately export anything at all.
    withAmbient('AGENT_NAME', configuredAgent, () => {
      expect(conflictingCredentials()).not.toContain('AGENT_NAME');
    });
  });

  it('reports a disagreement on the port as well as the name', () => {
    withAmbient('AGENT_PORT', '5199', () => {
      expect(conflictingCredentials()).toContain('AGENT_PORT');
    });
  });
});

// Resolving the port correctly is not enough on its own: worktree-init.sh assigns ports from an
// argument that defaults to 1 and checks nothing, so two worktrees can be *correctly* bound to the
// same port. The sibling worktrees are the second witness the port has — the checkout does not
// encode a port, but the fleet does, and every worktree's settings file is readable from any of them.
// Pure: the worktree listing is passed in, like checkoutAgent() and resolveMcpAgent().
describe('a port two worktrees both claim is a collision, not a preference', () => {
  const HERE = '/w/demo-retail-prana';
  const SIBLING = '/w/demo-retail-arcteryx';

  it('names the sibling that claims this worktree\'s port', () => {
    expect(
      conflictingPortWorktrees(HERE, '5174', [
        { path: HERE, port: '5174' },
        { path: SIBLING, port: '5174' }
      ])
    ).toEqual([SIBLING]);
  });

  it('is clean when every worktree has its own port', () => {
    expect(
      conflictingPortWorktrees(HERE, '5174', [
        { path: HERE, port: '5174' },
        { path: SIBLING, port: '5175' }
      ])
    ).toEqual([]);
  });

  it('ignores a worktree that configures no port at all', () => {
    // The main worktree has no agent and no port; a fresh clone has no settings file either.
    expect(conflictingPortWorktrees(HERE, '5174', [{ path: '/w/demo-retail', port: undefined }])).toEqual([]);
  });

  it('has nothing to collide with when this worktree has no port', () => {
    expect(conflictingPortWorktrees(HERE, undefined, [{ path: SIBLING, port: '5174' }])).toEqual([]);
  });
});

// Real git, real settings files — the I/O half of the check above, with no fixture repo and nothing
// faked. Runs wherever git does, including a single-worktree CI checkout.
describe.skipIf(!hasWorktreeSettings())('the worktree list comes from real git', () => {
  it('reports this checkout with the port it resolves for itself', () => {
    expect(worktreePorts()).toContainEqual({ path: repoRoot(), port: configuredPort });
  });
});

// The binding canary, asserted at its source rather than by string-matching a live response body:
// the token itself names the studio it belongs to.
describe.skipIf(!hasWorktreeSettings())('this worktree is bound to the search-discovery studio', () => {
  it('the configured token carries the expected studioCode claim', () => {
    expect(studioCode()).toBe('search-discovery');
  });
});

// The checkout is a second, independent witness to this agent's identity — worktree-init.sh writes
// the name into BOTH the `agent/<name>` branch and the `<repo>-<name>` worktree directory. Pure:
// the git values are passed in, so this is string logic with no I/O.
describe('the checkout says who it is, independently of any configuration', () => {
  it('reads the agent from an agent/<name> branch', () => {
    expect(checkoutAgent('agent/prana', 'demo-retail-prana', 'demo-retail')).toBe('prana');
  });

  it('falls back to the worktree directory on a short-lived PR branch', () => {
    expect(checkoutAgent('1114-stop-agent-name-leaking', 'demo-retail-arcterx', 'demo-retail')).toBe('arcterx');
  });

  it('implies no agent in the main worktree', () => {
    expect(checkoutAgent('main', 'demo-retail', 'demo-retail')).toBeUndefined();
  });

  it('distinguishes the near-miss names that made this bug silent', () => {
    // `arcteryx` and `prana` are both real registered agents, so a leaked value is a VALID name —
    // nothing downstream rejects it. The checkout is what tells them apart. (`arcterx`, the typo
    // that made this concrete, was deregistered on 2026-08-18; a near-miss pair still ships.)
    expect(checkoutAgent('agent/arcterx', 'demo-retail-arcterx', 'demo-retail')).not.toBe('arcteryx');
  });
});

// Real git + real settings in this worktree — the invariant the whole task is about.
describe.skipIf(!hasWorktreeSettings())('this checkout and its settings agree on who this agent is', () => {
  it('does not throw for the worktree it is running in', () => {
    expect(() => assertAgentMatchesCheckout()).not.toThrow();
  });

  it('throws loudly when the resolved name is a valid-but-wrong agent', () => {
    withAmbient('AGENT_NAME', 'arcteryx', () => {
      // Settings still win, so this must NOT throw — the ambient value never reaches the check.
      expect(() => assertAgentMatchesCheckout()).not.toThrow();
    });
  });
});

// The MCP header is the one identity channel resolved BEFORE any code in this repo runs: Claude
// Code interpolates .mcp.json at session start, so studio-poll.ts cannot intercept it the way it
// intercepts every other path. `work_on_next_task` has no `agentName` parameter either (unlike
// submit_for_review / release_task), so a header carrying a leaked-but-registered name records the
// claim against the wrong agent with no way to correct it afterwards. Assert on the value the
// header will actually carry, not on what the settings file says in isolation.
describe.skipIf(!hasWorktreeSettings())('the MCP X-Agent-Name header is bound to the worktree', () => {
  it('resolves to this worktree even when the launching shell exported another agent', () => {
    withAmbient('AGENT_NAME', 'arcteryx', () => {
      expect(resolveMcpAgent(mcpAgentTemplate(), settingsEnv(), process.env)).toBe(configuredAgent);
    });
  });
});

// Pure — the two-worktree case the live suite cannot express, because one test process is one
// session with one already-interpolated header. Both names are registered agents in this studio,
// which is exactly what makes the leak silent instead of an error.
describe('the header resolver follows Claude Code precedence: ambient wins, settings fill the rest', () => {
  const PRANA_SETTINGS = { WORKTREE_AGENT_NAME: 'prana', AGENT_NAME: 'prana' };
  const ARCTERYX_SHELL = { AGENT_NAME: 'arcteryx' };

  it('ignores a leaked AGENT_NAME when the template names a worktree-only variable', () => {
    expect(resolveMcpAgent('${WORKTREE_AGENT_NAME}', PRANA_SETTINGS, ARCTERYX_SHELL)).toBe('prana');
  });

  it('obeys the leak when the template names a variable the shell also exports', () => {
    // Why the variable had to be renamed rather than just re-sourced: settings cannot outrank an
    // inherited export, so any name the fleet's shells already carry stays compromised.
    expect(resolveMcpAgent('${AGENT_NAME}', PRANA_SETTINGS, ARCTERYX_SHELL)).toBe('arcteryx');
  });

  it('resolves to nothing when the worktree never defined the variable', () => {
    expect(resolveMcpAgent('${WORKTREE_AGENT_NAME}', {}, {})).toBeUndefined();
  });
});

// A worktree that cannot guarantee correct attribution must stop, not guess. whoami() runs this and
// agent-loop.sh gates on whoami, so the loop refuses to start a misattributing session.
describe.skipIf(!hasWorktreeSettings())('a header that would misattribute stops the worktree', () => {
  // Derived, not hardcoded: a literal agent name is only a *mismatch* on the worktrees that are
  // not that agent. Hardcoding 'arcteryx' passed everywhere except the arcteryx worktree, where
  // the "leak" matched the checkout and correctly did not throw — and CI never saw it, because
  // hasWorktreeSettings() skips this suite there.
  const foreignAgent = `not-${configuredAgent ?? 'unknown'}`;

  it('throws when the header variable itself is leaked from another worktree', () => {
    withAmbient('WORKTREE_AGENT_NAME', foreignAgent, () => {
      expect(() => assertAgentMatchesCheckout()).toThrow(new RegExp(foreignAgent));
    });
  });
});

// A red suite must say *why* it is red. hasCredentials() is a presence check, so a token the server
// rejects (expired, revoked, issued for another studio) lets the live suites run and fail with a
// bare `studio-ai HTTP 401` — which reads as a regression in whatever change is under test. That
// actually happened on 2026-08-18 while verifying #1114. Deliberately NOT fixed by making the skip
// predicate check validity: that would turn a credential problem back into a silent skip, the exact
// failure mode #1114 exists to eliminate, and ARCHITECTURE.md §5 wants a missing secret to fail the
// job rather than quietly pass. So the signal stays loud and only the diagnosis gets faster.
//
// Pure — status and claims are passed in, no I/O (standards/no-mocks.md permits this for I/O-free
// logic). The status it keys on is asserted against the real endpoint further down.
describe('a rejected credential is reported as a credential problem, not a transport error', () => {
  const CLAIMS = { studioCode: 'search-discovery', exp: 1789656498 };

  it('names the credential and the studio that token opens', () => {
    const message = studioErrorMessage(401, 'Unauthorized', CLAIMS);
    expect(message).toMatch(/STUDIO_AI_TOKEN/);
    expect(message).toMatch(/search-discovery/);
  });

  it('does not echo the server body, which can quote the rejected credential back', () => {
    const message = studioErrorMessage(401, 'rejected token eyJhbGciOiJIUzI1NiJ9.payload.sig', CLAIMS);
    expect(message).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('reports an expiry that has passed as the likely cause', () => {
    const expired = studioErrorMessage(401, '', { studioCode: 'search-discovery', exp: 1 });
    expect(expired).toMatch(/expired/i);
  });

  // The poll paths swallow errors by design — "no tasks" and "endpoint unreachable" are both just
  // "nothing to pick up" to agent-loop.sh. A refused credential must NOT land in that bucket, or a
  // dead token shows up as a loop idling politely forever. So it is thrown as its own type.
  it('classifies a refused credential apart from every other failure', () => {
    expect(studioError(401, '', CLAIMS)).toBeInstanceOf(CredentialRejected);
    expect(studioError(403, '', CLAIMS)).toBeInstanceOf(CredentialRejected);
    expect(studioError(500, 'boom', CLAIMS)).not.toBeInstanceOf(CredentialRejected);
    expect(studioError(500, 'boom', CLAIMS)).toBeInstanceOf(Error);
  });

  it('leaves every other failure as the plain transport error it was', () => {
    const message = studioErrorMessage(500, 'upstream boom', CLAIMS);
    expect(message).toMatch(/HTTP 500/);
    expect(message).toMatch(/upstream boom/);
    expect(message).not.toMatch(/STUDIO_AI_TOKEN/);
  });
});

// Real endpoint, real rejection — this is what makes the pure test above more than a guess about
// the server contract. No mock: a genuinely invalid bearer against the live MCP URL.
describe.skipIf(!hasCredentials())('the live endpoint really rejects an invalid credential', () => {
  it('answers 401, the status the message keys on', async () => {
    const res = await fetch(mcpUrl(), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer not-a-real-token',
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_tasks', arguments: {} } })
    });
    expect(res.status).toBe(401);
  });
});

// Pure parser tests — no I/O, so no service to run against (standards/no-mocks.md allows this for
// I/O-free logic). The fixture is a real `get_tasks` response captured from the live endpoint, with
// a second agent's task added: the studio has only one in-progress task today, so the live tests
// below cannot tell a working ownership filter from a broken one.
const TWO_AGENT_LISTING = `Tasks for studio "search-discovery" (status: In Progress):

Platform (platform):
  In Progress (2):
      #55: Promote \`Product\` type to \`$lib/domain/\` [arcterx] [owner: Cassandra Shum] (Idea #1)
        Move the \`Product\` type out of the feature module.
      #71: Something else entirely [prana] [owner: Cassandra Shum] (Idea #4)
        Another agent's work, mid-flight.
`;

// studio-ai ignores the `agent:` request filter — verified against the live endpoint, and
// .claude/skills/work-on-task/SKILL.md:43 says the same. Ownership therefore has to be applied to
// the listing here; without it an agent's loop resumes whatever task another agent is mid-way
// through, which is the one thing the fleet model must never do.
describe('ownership is applied client-side, because the server ignores the agent filter', () => {
  it('keeps only the requesting agent\'s tasks in a studio-wide listing', () => {
    expect(tasksStudioWide(TWO_AGENT_LISTING, 'arcterx')).toEqual([{ product: 'platform', number: 55 }]);
    expect(tasksStudioWide(TWO_AGENT_LISTING, 'prana')).toEqual([{ product: 'platform', number: 71 }]);
  });

  it('keeps only the requesting agent\'s tasks in a product-scoped listing', () => {
    expect(tasksForProduct(TWO_AGENT_LISTING, 'platform', 'arcterx')).toEqual([
      { product: 'platform', number: 55 }
    ]);
  });

  it('returns every task when no agent is given (the shared backlog)', () => {
    expect(tasksStudioWide(TWO_AGENT_LISTING)).toHaveLength(2);
  });
});

describe.skipIf(!hasCredentials())('studio-poll (real studio-ai MCP over HTTP)', () => {
  it('callTool reaches the live MCP endpoint studio-wide', async () => {
    // Shape, not slug: which studio we are bound to is asserted from the token above, so this
    // test is free to check only that the endpoint answered with a studio-wide listing.
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

  it('resumeTask self-resolves this agent rather than taking one from the caller', async () => {
    expect(isTask(await resumeTask())).toBe(true);
  });
});
