# AI Log 06 — Fix: tests ran against the Neon database

Date: 2026-09-18 · Tool: Claude Code (Claude Fable 5) · Trigger: owner-reported failure

**What happened:** After provisioning Neon and pointing .env's DATABASE_URL at
it (migrate deploy + seed both succeeded — Neon is live), `npm test` produced
18 failures. Diagnosis from the output: the integration suites were now
running against the remote database — cross-continent latency blew Vitest's
5s default timeout on every multi-roundtrip test, and the aborted setups
cascaded into "record not found" / "already_active" failures downstream. The
same suite passes 65/65 in ~2s against local Postgres; no code regression.

**The real defect (my assessment, worse than the red tests):** the suite was
*willing* to run against a remote database at all. Integration tests create
and delete rows; pointed at production, that's data corruption waiting for a
less careful cleanup. The red tests were the friendly version of this bug.

**Fix (D-26):**
1. `TEST_DATABASE_URL` override in vitest.setup.ts — DATABASE_URL can point at
   Neon for deployment work while tests stay local.
2. **Fail-closed guard**: any test run whose effective URL is not
   localhost/127.0.0.1 aborts with instructions; `ALLOW_REMOTE_TEST_DB=1` is
   the deliberate escape hatch. Same fail-closed philosophy as the rest of
   the system, applied to the test infrastructure itself.
3. `testTimeout: 30s` — a slow link or CI runner can no longer fake failures.
4. Committed `scripts/local-db.mjs` + `npm run db:local` (embedded real
   PostgreSQL 18, UTF8 database creation baked in) — the dev database no
   longer depends on anything outside the repo.
5. vitest config renamed to `.mts` and the redundant esbuild option dropped —
   both startup warnings gone.

**Verification:** 65/65 in ~2s against local; guard check with
TEST_DATABASE_URL unset and the Neon URL active → run refuses with the
instructive error. Neon inspected after the aborted run: **clean** — the
afterAll cleanups completed even through the failures (1 agent, 7 products,
5 customers, zero test debris). tsc + eslint green.
