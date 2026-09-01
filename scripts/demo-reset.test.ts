import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Integration tests — these run the REAL scripts/demo-reset.sh against a REAL temporary git
// repository, per standards/no-mocks.md. Nothing is stubbed: an actual bare origin, an actual
// baseline tag, actual commits.
//
// The script is copied into the fixture rather than run in place. It does `git reset --hard
// origin/main` and `git clean -fd` on whichever repo it finds itself in, so running it against
// this checkout would destroy the working tree that is running the tests.

const SCRIPT = join(process.cwd(), 'scripts/demo-reset.sh');
const BASELINE_TAG = 'demo-baseline/search-exact';
const DIR = 'src/lib/storefront';

const SEARCH_TS = `export function search(query: string, names: string[]): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return names;
  return names.filter((n) => n.toLowerCase().includes(q));
}
`;

const SEARCH_TEST_TS = `import { describe, it, expect } from 'vitest';
import { search } from './search';

describe('search', () => {
  it('does not tolerate typos', () => {
    expect(search('jaket', ['jacket'])).toEqual([]);
  });
});
`;

/** An unrelated module that lives in the same directory and must never trip the baseline checks. */
const CATEGORY_TS = `export const categories = ['shells', 'insulation'];\n`;

/** The capability arriving as a NEW file — the shape a hardcoded file list cannot see. */
const FUZZY_TS = `export function levenshtein(a: string, b: string): number {
  return a === b ? 0 : 1;
}
`;

let root: string | undefined;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function runReset(cwd: string, args: string[]): { status: number; output: string } {
  const res = spawnSync('bash', ['scripts/demo-reset.sh', ...args], { cwd, encoding: 'utf8' });
  return { status: res.status ?? -1, output: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

/**
 * The three ways `npm run test:security` can end, as real commands the fixture actually executes.
 *
 * The fixture has no `node_modules`, so it cannot run real vitest — that is why every file-level
 * test below passes `--no-verify`. These stand in for the *result* the script has to interpret, in
 * the same spirit as `SEARCH_TS` above standing in for a real matcher: real files, real commands,
 * a real repo. The genuine vitest + real-Postgres path is exercised against this checkout itself.
 *
 * `skip` is the important one: vitest exits **0** when every test is skipped (no `DATABASE_URL`),
 * so a naive "did it exit 0?" would call an unverifiable tree "ready".
 */
const SECURITY_OUTCOME = {
  pass: `node -e "console.log('Test Files  1 passed (1)'); console.log('Tests  4 passed (4)')"`,
  fail: `node -e "console.error('SECURITY — the storefront leaked 1 product that is NOT FOR SALE'); process.exit(1)"`,
  skip: `node -e "console.log('Test Files  1 skipped (1)'); console.log('Tests  4 skipped (4)')"`
} as const;

/** A repo at the demo baseline: matcher + its test + an unrelated module, tagged and pushed. */
function makeRepo(security: keyof typeof SECURITY_OUTCOME = 'pass'): string {
  root = mkdtempSync(join(tmpdir(), 'demo-reset-'));
  const origin = join(root, 'origin.git');
  const work = join(root, 'work');

  execFileSync('git', ['init', '--quiet', '--bare', '-b', 'main', origin]);
  execFileSync('git', ['init', '--quiet', '-b', 'main', work]);
  git(work, 'config', 'user.email', 'test@example.com');
  git(work, 'config', 'user.name', 'Demo Reset Test');
  git(work, 'remote', 'add', 'origin', origin);

  mkdirSync(join(work, DIR), { recursive: true });
  mkdirSync(join(work, 'scripts'), { recursive: true });
  copyFileSync(SCRIPT, join(work, 'scripts/demo-reset.sh'));
  writeFileSync(join(work, DIR, 'search.ts'), SEARCH_TS);
  writeFileSync(join(work, DIR, 'search.test.ts'), SEARCH_TEST_TS);
  writeFileSync(join(work, DIR, 'category.ts'), CATEGORY_TS);
  writeFileSync(
    join(work, 'package.json'),
    `${JSON.stringify(
      {
        name: 'demo-reset-fixture',
        private: true,
        scripts: {
          'test:baseline': `node -e "console.log('Tests  1 passed (1)')"`,
          'test:security': SECURITY_OUTCOME[security]
        }
      },
      null,
      2
    )}\n`
  );

  git(work, 'add', '-A');
  git(work, 'commit', '--quiet', '-m', 'baseline');
  git(work, 'tag', BASELINE_TAG);
  git(work, 'push', '--quiet', '-u', 'origin', 'main');
  git(work, 'push', '--quiet', 'origin', BASELINE_TAG);

  return work;
}

// --no-verify skips the script's `npx vitest` step: the fixture has no node_modules, and these
// tests are about the file-level baseline checks, not about re-running the matcher suite.
// --no-studio skips the MCP half, which is covered by demo-reset-studio.test.ts.

describe('demo-reset.sh --check', () => {
  it('passes on a repo that is genuinely at the baseline', () => {
    const work = makeRepo();

    const { status, output } = runReset(work, ['--check', '--no-verify']);

    expect(output).toContain('Ready to run the demo');
    expect(status).toBe(0);
  });

  it('fails when the capability arrives as a new file the file list does not name', () => {
    const work = makeRepo();
    // Exactly the #1149 shape: a new module, committed to main, that no SEARCH_FILES entry covers.
    writeFileSync(join(work, DIR, 'fuzzy.ts'), FUZZY_TS);
    git(work, 'add', '-A');
    git(work, 'commit', '--quiet', '-m', 'add edit-distance module');

    const { status, output } = runReset(work, ['--check', '--no-verify']);

    expect(status).not.toBe(0);
    expect(output).toContain('fuzzy.ts');
  });

  it('does not flag an unrelated change to another module in the same directory', () => {
    const work = makeRepo();
    writeFileSync(join(work, DIR, 'category.ts'), `${CATEGORY_TS}export const extra = true;\n`);
    git(work, 'add', '-A');
    git(work, 'commit', '--quiet', '-m', 'unrelated change to category');

    const { status, output } = runReset(work, ['--check', '--no-verify']);

    expect(output).toContain('Ready to run the demo');
    expect(status).toBe(0);
  });
});

// These deliberately do NOT pass --no-verify: the behavioural checks are the subject. A leak can
// live in ANY file, so `--check` asserts the security standards rather than watching a second
// directory — #1128 and #1129 were both enumeration misses, and this was the same bug one
// directory over.
describe('demo-reset.sh --check verifies the security standards', () => {
  it('fails when a security standard does not hold, wherever the leak lives', () => {
    const work = makeRepo('fail');

    const { status, output } = runReset(work, ['--check']);

    expect(status).not.toBe(0);
    expect(output).toMatch(/security/i);
    expect(output).not.toContain('Ready to run the demo');
  });

  it('fails when the security tests were SKIPPED — an unverifiable tree is not "ready"', () => {
    // vitest exits 0 when every test skips (no DATABASE_URL). Treating that as a pass would be a
    // quieter version of the very bug this check exists to fix.
    const work = makeRepo('skip');

    const { status, output } = runReset(work, ['--check']);

    expect(status).not.toBe(0);
    expect(output).toMatch(/not verified|skipped/i);
    expect(output).not.toContain('Ready to run the demo');
  });

  it('passes when the security standards hold', () => {
    const work = makeRepo('pass');

    const { status, output } = runReset(work, ['--check']);

    expect(output).toContain('Ready to run the demo');
    expect(status).toBe(0);
  });
});

// Residue is a SEPARATE failure from a leak, and the behavioural checks cannot see it: dead code
// never runs, so nothing leaks and every test stays green. It still ruins the demo — an agent asked
// to build the capability finds it already half-written and just wires it up, which is exactly how
// #1149 collapsed the beat. Caught at the git level so it needs no list of locations.
describe('demo-reset.sh --check rejects residue from a previous run', () => {
  it('fails on an uncommitted edit outside the matcher directory', () => {
    const work = makeRepo('pass');
    mkdirSync(join(work, 'src/lib/server/db'), { recursive: true });
    writeFileSync(
      join(work, 'src/lib/server/db/select.ts'),
      'export function selectMatchingProducts() {}\n'
    );

    const { status, output } = runReset(work, ['--check']);

    expect(status).not.toBe(0);
    expect(output).toContain('select.ts');
    expect(output).not.toContain('Ready to run the demo');
  });

  it('fails on an untracked module left behind anywhere in the repo', () => {
    const work = makeRepo('pass');
    mkdirSync(join(work, 'src/lib/server/db'), { recursive: true });
    writeFileSync(join(work, 'src/lib/server/db/fuzzy-select.ts'), FUZZY_TS);

    const { status, output } = runReset(work, ['--check']);

    expect(status).not.toBe(0);
    expect(output).toContain('fuzzy-select.ts');
    expect(output).not.toContain('Ready to run the demo');
  });
});

describe('demo-reset.sh full reset', () => {
  it('removes a capability file that reached main, and says so', () => {
    const work = makeRepo();
    writeFileSync(join(work, DIR, 'fuzzy.ts'), FUZZY_TS);
    git(work, 'add', '-A');
    git(work, 'commit', '--quiet', '-m', 'add edit-distance module');
    git(work, 'push', '--quiet', 'origin', 'main');

    const { status, output } = runReset(work, ['--no-verify', '--no-studio']);

    expect(existsSync(join(work, DIR, 'fuzzy.ts'))).toBe(false);
    expect(output).toContain('fuzzy.ts');
    expect(status).toBe(0);
  });
});
