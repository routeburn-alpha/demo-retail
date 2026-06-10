---
title: Tests Run Against Real Services
type: standard
---

**Real services, not mocks** — Does every test in this changeset run against real running services
(real Postgres, real Svelte components rendered in a real browser via Vitest browser mode, real
HTTP to the dev server), not mocked `fetch` or a fake database? Name the test file(s) and the real
service each one exercises.

The only permitted stub is a service with **unrecoverable side effects** (email, SMS, live
payments). If you stubbed one, name it and the side effect that justifies it.

A pure unit test is acceptable **only** for logic with no I/O (e.g. the search / synonym matcher in
`src/lib/storefront/search.ts`). If you wrote one, state explicitly why it has no I/O.

If you cannot run a test against the real service in this environment (missing `DATABASE_URL`, a
paid third party, etc.), say so at the review gate rather than substituting a mock.
