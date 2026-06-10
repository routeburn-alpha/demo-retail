import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Neon's Vercel integration writes .env.local; fall back to .env.
config({ path: '.env.local' });
config();

export default defineConfig({
  schema: './src/lib/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!
  }
});
