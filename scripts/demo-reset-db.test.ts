import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import * as schema from '../src/lib/server/db/schema';
import { resetRunSince } from './demo-reset-db';

// Integration test against the REAL database (no mocks). Skips when DATABASE_URL is absent.
//
// DATABASE_URL is usually the SHARED Neon database, and the reset under test deletes every order
// and cart created after a timestamp. Two guards keep it off real data:
//   1. everything runs inside an outer transaction that is always rolled back, so nothing commits;
//   2. the run start is in the year 2100, so even inside that transaction the reset can only match
//      the future-dated rows this test inserts.
const url = process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;

const RUN_START = new Date('2100-01-01T00:00:00Z');
const BEFORE_RUN = new Date('2099-12-31T23:00:00Z');
const DURING_RUN = new Date('2100-01-01T00:30:00Z');

class Rollback extends Error {}

suite('resetRunSince (integration)', () => {
  let client: Sql;
  let db: PostgresJsDatabase<typeof schema>;
  const ns = `__test__reset_${randomUUID().slice(0, 8)}`;

  beforeAll(() => {
    client = postgres(url!, { prepare: false, max: 1 });
    db = drizzle(client, { schema });
  });

  afterAll(async () => {
    await client?.end();
  });

  it('gives back the stock a run consumed and removes only that run’s orders and carts', async () => {
    let seen: {
      stock: number;
      orders: string[];
      carts: string[];
      result: Awaited<ReturnType<typeof resetRunSince>>;
    } | undefined;

    await expect(
      db.transaction(async (tx) => {
        const productId = `${ns}_shell`;
        await tx.insert(schema.products).values({
          id: productId,
          slug: productId,
          name: productId,
          category: 'test',
          priceCents: 100,
          description: '',
          imageUrl: ''
        });
        // Stock after the run sold 2: it started at 7.
        await tx.insert(schema.inventory).values({ productId, stock: 5 });

        const order = (id: string, qty: number, createdAt: Date) => ({ id, qty, createdAt });
        for (const o of [order(`${ns}_before`, 1, BEFORE_RUN), order(`${ns}_during`, 2, DURING_RUN)]) {
          await tx.insert(schema.orders).values({
            id: o.id,
            email: 'demo@example.com',
            totalCents: 100 * o.qty,
            createdAt: o.createdAt
          });
          await tx.insert(schema.orderItems).values({
            orderId: o.id,
            productId,
            nameSnapshot: productId,
            unitPriceCents: 100,
            qty: o.qty
          });
        }
        await tx.insert(schema.carts).values([
          { id: `${ns}_cart_before`, createdAt: BEFORE_RUN },
          { id: `${ns}_cart_during`, createdAt: DURING_RUN }
        ]);

        const result = await resetRunSince(tx, RUN_START);

        const [inv] = await tx
          .select({ stock: schema.inventory.stock })
          .from(schema.inventory)
          .where(eq(schema.inventory.productId, productId));
        const orders = await tx
          .select({ id: schema.orders.id })
          .from(schema.orders)
          .where(inArray(schema.orders.id, [`${ns}_before`, `${ns}_during`]));
        const carts = await tx
          .select({ id: schema.carts.id })
          .from(schema.carts)
          .where(inArray(schema.carts.id, [`${ns}_cart_before`, `${ns}_cart_during`]));

        seen = { stock: inv.stock, orders: orders.map((o) => o.id), carts: carts.map((c) => c.id), result };
        throw new Rollback();
      })
    ).rejects.toBeInstanceOf(Rollback);

    expect(seen?.stock).toBe(7);
    expect(seen?.orders).toEqual([`${ns}_before`]);
    expect(seen?.carts).toEqual([`${ns}_cart_before`]);
    expect(seen?.result).toEqual({ orders: 1, carts: 1, unitsRestocked: 2 });
  });
});
