import { config } from 'dotenv';
import { readFileSync } from 'node:fs';

// Neon's Vercel integration writes .env.local; fall back to .env.
config({ path: '.env.local' });
config();

import { fileURLToPath, pathToFileURL } from 'node:url';
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

// The visible Routeburn catalogue — sourced from the existing static catalog.
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

/**
 * The hidden "Gear for the Long Way Out" collection (`schema.ts`): real, purchasable products that
 * are deliberately NOT surfaced on the storefront. They are excluded by `collection: 'elsewhere'`
 * alone — they are neither `hidden` nor inactive — so the only thing keeping them off the site is
 * the core predicate in `selectCoreProducts`. That makes them the live subject of
 * `standards/no-hidden-products-in-search.md`: widen the catalogue anywhere and these leak.
 *
 * Each is named close to a public sibling (and borrows its image) so a leak is unmistakable —
 * "Alpenglow 3P" would surface directly beside the public "Alpenglow 2P Tent".
 */
export const ELSEWHERE_SEED: NewProductRow[] = [
  {
    id: 'elsewhere-001',
    slug: 'alpenglow-3p-expedition-tent',
    name: 'Alpenglow 3P Expedition Tent',
    category: 'tent',
    priceCents: 79500,
    salePriceCents: null,
    description:
      'Unreleased. Three-person four-season expedition shelter for the Long Way Out programme.',
    imageUrl: '/products/tent-001.jpg',
    department: 'unisex',
    collection: 'elsewhere',
    hidden: false,
    active: true
  },
  {
    id: 'elsewhere-002',
    slug: 'long-way-out-3l-storm-shell',
    name: 'Long Way Out 3L Storm Shell',
    category: 'shell jacket',
    priceCents: 61000,
    salePriceCents: null,
    description: 'Unreleased. Three-layer storm shell built for sustained exposure above treeline.',
    imageUrl: '/products/shell-001.jpg',
    department: 'unisex',
    collection: 'elsewhere',
    hidden: false,
    active: true
  },
  {
    id: 'elsewhere-003',
    slug: 'traverse-60l-haul-pack',
    name: 'Traverse 60L Haul Pack',
    category: 'backpack',
    priceCents: 43500,
    salePriceCents: null,
    description: 'Unreleased. Sixty-litre haul pack for multi-week traverses and resupply carries.',
    imageUrl: '/products/pack-001.jpg',
    department: 'unisex',
    collection: 'elsewhere',
    hidden: false,
    active: true
  }
];

// Give every product a healthy, slightly varied stock level.
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

  console.log(
    `Seeding ${coreRows.length} core products + ${ELSEWHERE_SEED.length} hidden (elsewhere) products…`
  );

  for (const row of [...coreRows, ...ELSEWHERE_SEED]) {
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

// Only seed when run as a script. Importing this module (e.g. for `ELSEWHERE_SEED` in a test)
// must not hit the database — same entrypoint guard as `scripts/seed-facets.ts`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
