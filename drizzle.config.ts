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
  // Older databases still hold a `standards` table that schema.ts does not define; without this
  // filter `db:push` would treat it as a data-loss drop and open a prompt no agent shell can answer.
  tablesFilter: ['!standards']
});
