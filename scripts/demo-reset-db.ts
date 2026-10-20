// demo-reset-db — the database half of the cart → checkout demo reset (docs/DEMO-CHECKOUT.md).
//
// A checkout run decrements stock and creates carts and orders. DATABASE_URL is the SHARED Neon
// database, so "reset" can never mean db:seed / db:push — those rewrite state other people and
// agents depend on. This undoes only what one run created, scoped by the time the run started:
//   1. give back the stock the run's orders consumed,
//   2. delete the run's orders (order_items cascade) and carts (cart_items cascade),
// all in one transaction, so a failure part-way leaves the database exactly as it was.
//
// CLI:
//   tsx scripts/demo-reset-db.ts --since 2026-10-20T09:00:00Z

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { drizzle, type PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../src/lib/server/db/schema';

/** A connection or a transaction — the test passes a transaction it always rolls back. */
type Database = PgDatabase<PostgresJsQueryResultHKT, typeof schema>;

export interface RunResetResult {
  orders: number;
  carts: number;
  unitsRestocked: number;
}

export async function resetRunSince(database: Database, runStart: Date): Promise<RunResetResult> {
  const since = runStart.toISOString();
  return database.transaction(async (tx) => {
    const [{ units }] = await tx.execute<{ units: number }>(sql`
      WITH consumed AS (
        SELECT oi.product_id, SUM(oi.qty)::int AS qty
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.created_at >= ${since}
        GROUP BY oi.product_id
      ), restocked AS (
        UPDATE inventory i SET stock = i.stock + c.qty
        FROM consumed c WHERE i.product_id = c.product_id
        RETURNING c.qty
      )
      SELECT COALESCE(SUM(qty), 0)::int AS units FROM restocked
    `);
    const orders = await tx.execute(sql`DELETE FROM orders WHERE created_at >= ${since} RETURNING id`);
    const carts = await tx.execute(sql`DELETE FROM carts WHERE created_at >= ${since} RETURNING id`);
    return { orders: orders.length, carts: carts.length, unitsRestocked: units };
  });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const raw = argv[argv.indexOf('--since') + 1];
  const runStart = argv.includes('--since') && raw ? new Date(raw) : undefined;
  if (!runStart || Number.isNaN(runStart.getTime())) {
    throw new Error('Usage: tsx scripts/demo-reset-db.ts --since <RUN_START, e.g. 2026-10-20T09:00:00Z>');
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set.');

  const client = postgres(connectionString, { prepare: false, max: 1 });
  try {
    const r = await resetRunSince(drizzle(client, { schema }), runStart);
    console.log(
      `✓ Database reset since ${runStart.toISOString()} — restocked ${r.unitsRestocked} unit(s), ` +
        `removed ${r.orders} order(s) and ${r.carts} cart(s).`
    );
  } finally {
    await client.end();
  }
}

// Run the CLI only when invoked directly (not when imported by the test).
if (process.argv[1]?.endsWith('demo-reset-db.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
