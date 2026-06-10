import { defineWorkspace } from 'vitest/config';

// Two runtimes, one source of test config:
//  - browser: Svelte component tests (*.svelte.test.ts) in real Chromium
//  - node:    server / pure-logic tests (everything else) in Node
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
      include: ['src/**/*.test.ts'],
      exclude: ['src/**/*.svelte.test.ts'],
      setupFiles: ['./vitest.setup.node.ts']
    }
  }
]);
