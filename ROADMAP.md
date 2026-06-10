# Roadmap — Tarn & Trail full-stack storefront

A polished premium outdoor store on the surface, with a hidden collection —
**"Gear for the Long Way Out"** — discoverable through search and a secret URL.
Each milestone is its own deployable PR, so adding a studio idea/task produces a
visible, shippable change.

## Stack

- **SvelteKit 2 / Svelte 5** — server-rendered (`+page.server.ts`, form actions, `+server.ts` APIs)
- **Neon Postgres + Drizzle ORM** — `src/lib/server/db/`
- **Vercel** — `@sveltejs/adapter-vercel`, configured by `vercel.ts`
- **Tailwind** — palette via CSS custom properties (`src/app.css`)

## Milestones

- [x] **M0 — DB foundation.** Drizzle schema (products, inventory, carts, cart_items,
      orders, order_items), seed of the existing 15 products, browse served from the DB.
- [ ] **M1 — PDP + cart.** `/product/[slug]` detail pages; cookie-session cart with
      add / update qty / remove.
- [ ] **M2 — Checkout + orders.** `/checkout` (mock payment) → order creation +
      inventory decrement; `/orders/[id]` confirmation and `/orders` history.
- [ ] **M3 — Admin.** Password-gated `/admin` to toggle active/hidden and edit
      price + stock.
- [ ] **M4 — The hidden layer.** Seed the strange products, trigger-search unlock,
      `/expedition/elsewhere`, the "elsewhere" theme, custom 404, strange order
      confirmations.

## First-time setup

```bash
npm install
vercel link                # interactive — type `! vercel link`
vercel install neon        # provisions Neon, sets DATABASE_URL
vercel env pull .env.local
npm run db:push            # create tables
npm run db:seed            # load the catalogue
npm run dev
```

## Data model (M0)

| Table         | Purpose                                                      |
| ------------- | ----------------------------------------------------------- |
| `products`    | Catalogue. `collection` = `core` \| `elsewhere`, plus `hidden`/`active` flags. |
| `inventory`   | Per-product stock.                                          |
| `carts`       | Anonymous cart; id stored in an httpOnly cookie.            |
| `cart_items`  | Line items in a cart.                                       |
| `orders`      | Placed orders; `contains_hidden` flags an "elsewhere" purchase. |
| `order_items` | Order line items with price/name snapshots.                |
