/**
 * Seed sample per-category facet orderings (idea: browse #1, task #3).
 *
 * The repo is push-only (`schema.ts` is the source of truth, applied via `npm run db:push`), so the
 * "migration" for the facet tables is their schema (browse #1) plus this reproducible sample data.
 * Idempotent: each category is replaced wholesale and defaults upsert, so re-running converges.
 *
 * Convention: `category_slug` is the **slugified `products.category`** (e.g. "shell jacket" →
 * "shell-jacket"). Category-detection work (browse #6/#7) should map the browse context to the same
 * slug form so these rows line up with the real catalogue.
 *
 * Run with:  npm run db:seed:facets
 *
 * Self-contained, mirroring scripts/seed.ts: loads .env.local, builds its own postgres-js handle,
 * and reuses the browse #2 data layer (no `$env`, so it runs under plain tsx).
 */
import { config } from 'dotenv';

// Neon's Vercel integration writes .env.local; fall back to .env.
config({ path: '.env.local' });
config();

import { pathToFileURL } from 'node:url';
import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../src/lib/server/db/schema';
import { defaultFacetOrders } from '../src/lib/server/db/schema';
import { deleteCategoryFacetOrders, insertCategoryFacetOrders } from '../src/lib/server/db/select';
import { toCategoryFacetOrderRows } from '../src/lib/server/db/map';
import type { CategoryFacetConfig, FacetOrder } from '../src/lib/domain/facets';

type Database = PostgresJsDatabase<typeof schema>;

/**
 * Sample category orderings keyed by slugified catalogue category. The facet keys are the
 * forward-looking filter dimensions the browse UI (#5/#8) will render; the orderings encode the
 * idea's hypothesis (tents lead with season+capacity, jackets with waterproofing/insulation, etc.).
 */
export const FACET_SEED: CategoryFacetConfig[] = [
  { categorySlug: 'tent', facetOrders: [
    { facetKey: 'season', displayOrder: 1 },
    { facetKey: 'capacity', displayOrder: 2 }
  ] },
  { categorySlug: 'shell-jacket', facetOrders: [
    { facetKey: 'waterproof', displayOrder: 1 },
    { facetKey: 'insulation', displayOrder: 2 }
  ] },
  { categorySlug: 'down-jacket', facetOrders: [
    { facetKey: 'insulation', displayOrder: 1 },
    { facetKey: 'warmth', displayOrder: 2 }
  ] },
  { categorySlug: 'hiking-boot', facetOrders: [
    { facetKey: 'size', displayOrder: 1 },
    { facetKey: 'weight', displayOrder: 2 }
  ] }
];

/** Fallback ordering for categories with no explicit configuration. */
export const DEFAULT_FACET_SEED: FacetOrder[] = [
  { facetKey: 'price', displayOrder: 1 },
  { facetKey: 'rating', displayOrder: 2 },
  { facetKey: 'availability', displayOrder: 3 }
];

/**
 * Apply the facet seed to `database` (idempotent). Reuses the browse #2 adapters/mappers so the
 * persistence rules live in one place. Exported so the integration test can run it against a real DB.
 */
export async function seedFacets(database: Database): Promise<void> {
  for (const facetConfig of FACET_SEED) {
    await database.transaction(async (tx) => {
      await deleteCategoryFacetOrders(tx, facetConfig.categorySlug);
      await insertCategoryFacetOrders(tx, toCategoryFacetOrderRows(facetConfig));
    });
  }

  for (const fallback of DEFAULT_FACET_SEED) {
    await database
      .insert(defaultFacetOrders)
      .values({ facetKey: fallback.facetKey, displayOrder: fallback.displayOrder })
      .onConflictDoUpdate({
        target: defaultFacetOrders.facetKey,
        set: { displayOrder: fallback.displayOrder }
      });
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Run `vercel env pull .env.local` first.');
  }

  const client = postgres(connectionString, { prepare: false });
  const db = drizzle(client, { schema });

  console.log(
    `Seeding facet orders for ${FACET_SEED.length} categories + ${DEFAULT_FACET_SEED.length} defaults…`
  );
  await seedFacets(db);
  console.log('Facet seed complete.');
  await client.end();
}

// Only run when invoked directly (`tsx scripts/seed-facets.ts`), not when imported by the test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
