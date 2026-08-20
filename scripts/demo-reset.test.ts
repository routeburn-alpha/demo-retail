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

/** A repo at the demo baseline: matcher + its test + an unrelated module, tagged and pushed. */
function makeRepo(): string {
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
