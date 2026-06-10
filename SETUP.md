# Setup — Tarn & Trail storefront

Onboarding and stack reference for the storefront. Product direction (milestones, what to build
next) lives in the studio as ideas under the **platform** product — not in this file.

## Stack

- **SvelteKit 2 / Svelte 5** — server-rendered (`+page.server.ts`, form actions, `+server.ts` APIs)
- **Neon Postgres + Drizzle ORM** — `src/lib/server/db/`
- **Vercel** — `@sveltejs/adapter-vercel`, configured by `vercel.ts`
- **Tailwind** — palette via CSS custom properties (`src/app.css`)

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

## Data model

| Table         | Purpose                                                      |
| ------------- | ----------------------------------------------------------- |
| `products`    | Catalogue. `collection` = `core` \| `elsewhere`, plus `hidden`/`active` flags. |
| `inventory`   | Per-product stock.                                          |
| `carts`       | Anonymous cart; id stored in an httpOnly cookie.            |
| `cart_items`  | Line items in a cart.                                       |
| `orders`      | Placed orders; `contains_hidden` flags an "elsewhere" purchase. |
| `order_items` | Order line items with price/name snapshots.                |
