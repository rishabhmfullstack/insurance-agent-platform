# AI Log 03 — Phase 2: DB Verification, Catalogue, Customers, Eligibility & Premium

Date: 2026-09-18 · Tool: Claude Code (Claude Fable 5)

**Objective:** Close the Phase 1 gap (real-database verification of the
migration), then build the product catalogue, customer management, and the
eligibility/premium domain core with unit tests. No applications/PDF/payment
yet.

## Database verification (the Phase 1 open risk)

**Constraint:** no Docker, no Postgres on the machine; Neon needs the owner's
browser login. **AI recommendation:** run real PostgreSQL binaries locally via
`embedded-postgres` (D-20) instead of deferring verification to deploy day.
Accepted — "real database" beats "wait for Neon" for everything except the
final connection string.

- `prisma migrate deploy` applied the init migration (including the raw-SQL
  block) cleanly.
- **`scripts/verify-schema.ts` (committed): 38 checks, all passing** — every
  table, both partial unique predicates, all six CHECK constraints, the
  composite FK (wrong-agent insert rejected), EXPIRED freeing the
  duplicate-application slot, cancel-before-regenerate for payments, the
  provider_payment_id idempotency anchor, one-policy-per-application, and the
  policy sequence.
- Seed ran twice → identical counts (1 agent / 7 products / 5 customers):
  idempotent.
- Demo agent login verified over real HTTP (csrf → credentials callback →
  session cookie → dashboard renders seeded customers).

**Issues found while verifying (each one a real catch):**
1. **WIN1252 encoding** — local initdb default couldn't store "₹"; DB
   recreated with UTF8 (Neon is UTF8; local-only gotcha, documented in D-20).
2. **Auth.js UntrustedHost** in local production builds — fixed with
   `trustHost: true` (D-21). The Phase 1 smoke test missed it because it never
   hit the auth API routes; the deeper flow test caught it.
3. Verification script first version asserted unique-violations by constraint
   name; PG 18 reports them by key columns — assertions fixed to match
   message+meta.

## Implementation

- **Domain (pure):** `rules.ts` (zod schemas for JSONB rule configs + age
  helpers), `eligibility.ts` (verdict + human-readable reasons), `premium.ts`
  (band × factors, round-once). The profile panel and the future create-quote
  guard call the same functions — they cannot disagree.
- **Data layer:** `data/customers.ts` (agent-scoped fetchers, notFound on
  wrong owner, friendly P2002 mapping), `data/products.ts` (JSONB zod-parsed
  at the read boundary).
- **Actions:** `createCustomerAction` — validate → requireAgent → data call →
  revalidate/redirect (thin, per the ~15-line rule).
- **UI:** products catalogue (criteria shown in plain words; deliberately no
  select button — selection needs customer context), dashboard with real
  queries, customer form (conditional vehicle-year), customer profile with
  Eligible/Not-eligible panels and premium previews.
- **Seed:** 7 products across 4 categories, 5 eligibility-contrast customers
  (clean 28yo; 63yo overlap band; 35yo smoker with an 11-year-old car; ₹2.5L
  income; 72yo senior-only).
- tsconfig target → ES2020 for BigInt literals (D-22).

## Tests & validation

- **32 Vitest unit tests, all passing:** birthday-edge age math, inclusive age
  bounds (17/18, 60/61), income threshold (equal passes, one rupee below
  fails), vehicle age 15/16, reason accumulation, health overlap band, band
  edges (30/31, 45/46, 59/60 — including the 60-overlap bug planning fixed),
  factor stacking, **round-once proof** (base ₹8,333 × 1.3 × 1.5 = ₹16,249;
  per-step rounding would give ₹16,250), whole-rupee invariant.
- `tsc` ✓ · eslint ✓ · `next build` ✓ (route table = planned surface).
- **Manual HTTP flow:** login 302 + session cookie → dashboard lists all 5
  customers → products page shows criteria chips → Meera (63): both health
  products eligible, "Age 63 exceeds the maximum 60" on term → Rohan: premiums
  exactly ₹15,600 / ₹15,210 / ₹3,900 (hand-computed expectations) → Sunita:
  both income reasons with thresholds → unknown UUID 404 → anonymous 307 to
  /login → duplicate phone rejected with friendly message.

## My evaluation of AI output this session

Accepted the embedded-Postgres approach and the trustHost fix after checking
what each means for the Vercel deployment (both converge with production
behavior). Pushed the verification script to assert *behavior* (real failing
inserts) rather than just catalog presence — presence checks alone would have
missed nothing this time, but behavior checks are what make the 38/38 claim
meaningful.
