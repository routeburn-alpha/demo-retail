import { type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'sveltekit',
  buildCommand: 'npm run build',
};
