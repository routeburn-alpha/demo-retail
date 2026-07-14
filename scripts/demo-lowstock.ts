import { config } from 'dotenv';

// Neon's Vercel integration writes .env.local; fall back to .env.
config({ path: '.env.local' });
config();

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { inventory } from '../src/lib/server/db/schema';

// Force a spread of low stock levels so every low-stock badge threshold has a
// product to render against during the demo. Run *after* `db:seed`, which
// otherwise resets every product to a healthy 8+ stock.
//   1 → "Last one!" (=1) and every lower threshold
//   3 → "Only N left" (<=5)
//   6 → "Selling fast" (<=8) only
const LOW_STOCK: Record<string, number> = {
  'shell-001': 1,
  'down-001': 3,
  'fleece-001': 6
};

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Run `vercel env pull .env.local` first.');
  }

  const client = postgres(connectionString, { prepare: false });
  const db = drizzle(client);

  for (const [productId, stock] of Object.entries(LOW_STOCK)) {
    const updated = await db
      .update(inventory)
      .set({ stock })
      .where(eq(inventory.productId, productId))
      .returning({ productId: inventory.productId });

    if (updated.length === 0) {
      console.warn(`⚠️  ${productId} not found — run \`npm run db:seed\` first.`);
    } else {
      console.log(`Set ${productId} stock → ${stock}`);
    }
  }

  console.log('Low-stock demo state applied.');
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
