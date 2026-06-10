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
  },
  // The `standards` table is deliberately managed outside Drizzle (created/seeded by
  // scripts/seed-standards.ts), so it is absent from schema.ts. Without this filter,
  // `db:push` sees it as a data-loss drop and opens an interactive prompt that no
  // agent/CI shell can answer. Excluding it lets push run non-interactively.
  tablesFilter: ['!standards']
});
