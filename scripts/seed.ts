import { config } from 'dotenv';
import { readFileSync } from 'node:fs';

// Neon's Vercel integration writes .env.local; fall back to .env.
config({ path: '.env.local' });
config();

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { products, inventory } from '../src/lib/server/db/schema';
import type { NewProductRow } from '../src/lib/server/db/schema';
import type { Department } from '../src/lib/domain/department';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

type CatalogEntry = {
  id: string;
  name: string;
  category: string;
  price: number;
  salePrice?: number;
  description: string;
  imageUrl: string;
  department: Department;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// The visible Tarn & Trail catalogue — sourced from the existing static catalog.
const catalog: CatalogEntry[] = JSON.parse(
  readFileSync(resolve(root, 'static/catalog.json'), 'utf-8')
);

const coreRows: NewProductRow[] = catalog.map((p) => ({
  id: p.id,
  slug: slugify(p.name),
  name: p.name,
  category: p.category,
  priceCents: Math.round(p.price * 100),
  salePriceCents: p.salePrice != null ? Math.round(p.salePrice * 100) : null,
  description: p.description,
  imageUrl: p.imageUrl,
  department: p.department,
  collection: 'core',
  hidden: false,
  active: true
}));

// Give every core product a healthy, slightly varied stock level.
function stockFor(id: string): number {
  const n = [...id].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return 8 + (n % 30);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Run `vercel env pull .env.local` first.');
  }

  const client = postgres(connectionString, { prepare: false });
  const db = drizzle(client);

  console.log(`Seeding ${coreRows.length} core products…`);

  for (const row of coreRows) {
    await db
      .insert(products)
      .values(row)
      .onConflictDoUpdate({
        target: products.id,
        set: {
          slug: row.slug,
          name: row.name,
          category: row.category,
          priceCents: row.priceCents,
          salePriceCents: row.salePriceCents,
          description: row.description,
          imageUrl: row.imageUrl,
          department: row.department,
          collection: row.collection,
          hidden: row.hidden,
          active: row.active
        }
      });

    await db
      .insert(inventory)
      .values({ productId: row.id, stock: stockFor(row.id) })
      .onConflictDoUpdate({
        target: inventory.productId,
        set: { stock: stockFor(row.id) }
      });
  }

  console.log('Seed complete.');
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
