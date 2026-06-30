import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  timestamp,
  serial,
  unique,
  index
} from 'drizzle-orm/pg-core';

/**
 * Two storefronts share one table. `core` is the visible Routeburn catalogue;
 * `elsewhere` is the hidden "Gear for the Long Way Out" collection, surfaced only
 * once a shopper discovers it. Hidden rows are real, purchasable products.
 */
export const collectionEnum = pgEnum('collection', ['core', 'elsewhere']);

/** Department / gender a product belongs to. `unisex` is gear that shows under any department filter. */
export const departmentEnum = pgEnum('department', ['womens', 'mens', 'unisex']);

export const products = pgTable('products', {
  id: text('id').primaryKey(), // stable human ids, e.g. 'shell-001'
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  priceCents: integer('price_cents').notNull(),
  description: text('description').notNull(),
  imageUrl: text('image_url').notNull(),
  salePriceCents: integer('sale_price_cents'),
  department: departmentEnum('department').notNull().default('unisex'),
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

/**
 * Per-category facet ordering (idea: browse #1). Each row places one facet at a
 * position within one category; the UNIQUE(category_slug, facet_key) constraint
 * keeps a facet from appearing twice in the same category. `category_facet_orders_category_idx`
 * supports the by-category lookup the port (`getFacetOrderForCategory`) runs.
 */
export const categoryFacetOrders = pgTable(
  'category_facet_orders',
  {
    id: serial('id').primaryKey(),
    categorySlug: text('category_slug').notNull(),
    facetKey: text('facet_key').notNull(),
    displayOrder: integer('display_order').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  (t) => ({
    categoryFacet: unique('category_facet_orders_category_facet').on(t.categorySlug, t.facetKey),
    byCategory: index('category_facet_orders_category_idx').on(t.categorySlug)
  })
);

/** Fallback facet ordering for categories with no explicit configuration. */
export const defaultFacetOrders = pgTable('default_facet_orders', {
  id: serial('id').primaryKey(),
  facetKey: text('facet_key').notNull().unique(),
  displayOrder: integer('display_order').notNull()
});

export type ProductRow = typeof products.$inferSelect;
export type NewProductRow = typeof products.$inferInsert;
export type OrderRow = typeof orders.$inferSelect;
export type CategoryFacetOrderRow = typeof categoryFacetOrders.$inferSelect;
export type NewCategoryFacetOrderRow = typeof categoryFacetOrders.$inferInsert;
export type DefaultFacetOrderRow = typeof defaultFacetOrders.$inferSelect;
export type NewDefaultFacetOrderRow = typeof defaultFacetOrders.$inferInsert;
