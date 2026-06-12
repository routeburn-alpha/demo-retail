# INITIAL SETUP — ⚠️ RUN ONCE ONLY

> **This file is the one-time provisioning recipe used to stand the storefront up the
> first time.** It has been run. The shared dev database, the Vercel project link, and
> the seeded catalogue all exist. **Do not run any of the commands below again.**
>
> - Running `vercel link` or `vercel install neon` again will create a new Vercel
>   project / new Neon DB — not what you want.
> - Running `npm run db:push` or `npm run db:seed` again rewrites shared state that
>   other devs and managed agents depend on.
> - If you are a day-to-day dev or a managed agent, **go to [`CLAUDE.md`](CLAUDE.md)**.
>   It is the day-to-day reference. This file is not for you.

## The one-time recipe (already run)

For historical reference and for anyone standing up a parallel copy of the storefront
from scratch:

```bash
npm install
vercel link                # interactive — links to the Vercel project
vercel install neon        # provisions Neon, sets DATABASE_URL
vercel env pull .env.local
npm run db:push            # create tables
npm run db:seed            # load the catalogue
```

After that, day-to-day work is just `vercel env pull .env.local && npm run dev` — see
[`CLAUDE.md`](CLAUDE.md).
