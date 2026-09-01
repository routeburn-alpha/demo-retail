import { defineWorkspace } from 'vitest/config';

// Three projects, one source of test config:
//  - browser:  Svelte component tests (*.svelte.test.ts) in real Chromium
//  - node:     server / pure-logic / framework-script tests (everything else) in Node
//  - security: tests enforcing a security standard (*.security.test.ts) in Node
//
// `security` is split out so CI can report it as its OWN check: a hidden-product leak turns the
// `security` job red while `check` / `build` / `test` stay green, which is the whole point of the
// named-job ladder (platform #1130). It is a separate PROJECT rather than a CLI `--exclude` because
// a project's own `exclude` beats the flag — `vitest run --exclude '**/x.test.ts'` silently still
// runs the file. Projects are the only selection mechanism that actually works here.
//
// Membership is by filename convention, so a future security standard joins this job by being named
// `*.security.test.ts` — no config change — mirroring how `standards/*.md` auto-joins the
// confirmStandards gate.
//
// `npm test` runs ALL projects, so the local gate is unchanged and still covers security tests.
export default defineWorkspace([
  {
    extends: './vite.config.ts',
    test: {
      name: 'browser',
      include: ['src/**/*.svelte.test.ts'],
      browser: {
        enabled: true,
        provider: 'playwright',
        name: 'chromium',
        headless: true
      }
    }
  },
  {
    extends: './vite.config.ts',
    test: {
      name: 'node',
      environment: 'node',
      include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
      // Security tests are excluded here so they run in the `security` project alone — otherwise a
      // leak would redden both jobs and the named ladder would say nothing.
      exclude: ['src/**/*.svelte.test.ts', 'src/**/*.security.test.ts'],
      setupFiles: ['./vitest.setup.node.ts']
    }
  },
  {
    extends: './vite.config.ts',
    test: {
      name: 'security',
      environment: 'node',
      include: ['src/**/*.security.test.ts'],
      setupFiles: ['./vitest.setup.node.ts']
    }
  }
]);
