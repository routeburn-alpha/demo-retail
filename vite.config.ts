import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// Test config lives in vitest.workspace.ts (browser + node projects).
export default defineConfig({
  plugins: [sveltekit()]
});
