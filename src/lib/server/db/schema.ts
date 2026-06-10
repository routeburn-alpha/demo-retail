import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  timestamp,
  serial,
  unique
} from 'drizzle-orm/pg-core';

/**
 * Two storefronts share one table. `core` is the visible Tarn & Trail catalogue;
 * `elsewhere` is the hidden "Gear for the Long Way Out" collection, surfaced only
 * once a shopper discovers it. Hidden rows are real, purchasable products.
 */
export const collectionEnum = pgEnum('collection', ['core', 'elsewhere']);

export const products = pgTable('products', {
  id: text('id').primaryKey(), // stable human ids, e.g. 'shell-001'
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  priceCents: integer('price_cents').notNull(),
  description: text('description').notNull(),
  imageUrl: text('image_url').notNull(),
  collection: collectionEnum('collection').notNull().default('core'),
  hidden: boolean('hidden').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const inventory = pgTable('inventory', {
  productId: text('product_id')
    .primaryKey()
    .references(() => products.id, { onDelete: 'cascade' }),
  stock: integer('stock').notNull().default(0)
});

/** A cart is anonymous; its id lives in an httpOnly cookie. No login required. */
export const carts = pgTable('carts', {
  id: text('id').primaryKey(),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const cartItems = pgTable(
  'cart_items',
  {
    id: serial('id').primaryKey(),
    cartId: text('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    qty: integer('qty').notNull().default(1)
  },
  (t) => ({
    cartProduct: unique('cart_items_cart_product').on(t.cartId, t.productId)
  })
);

export const orders = pgTable('orders', {
  id: text('id').primaryKey(), // short human id, e.g. 'TNT-7K2Q'
  email: text('email').notNull(),
  status: text('status').notNull().default('confirmed'),
  totalCents: integer('total_cents').notNull(),
  containsHidden: boolean('contains_hidden').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: text('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  productId: text('product_id')
    .notNull()
    .references(() => products.id),
  nameSnapshot: text('name_snapshot').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  qty: integer('qty').notNull()
});

export type ProductRow = typeof products.$inferSelect;
export type NewProductRow = typeof products.$inferInsert;
export type OrderRow = typeof orders.$inferSelect;
