# AI Log 09 — Ship Phase: seed polish, production QA, README, walkthrough

Date: 2026-09-18 · Tool: Claude Code (Claude Fable 5)

**Objective:** Make the submission reviewer-ready: reproducible mid-flow demo
data, a final QA/hardening pass on production, README rewritten from the
verified state, docs closure, walkthrough script, final full-flow dry run.
Constraints honored: no new features, no src/ changes without stopping first
(none were needed), no fake money in seed, real ACTIVE policy preserved.

## Seed polish — one real failure, reported then fixed

Extended the seed to create two demo applications **through the real
pipeline** (D-27): Meera → QUOTE_GENERATED, Rohan → AGREED (+ one logged
demo WhatsApp share so the timeline reads naturally). No payments, policies
or ACTIVE states are ever seeded.

**Failure hit:** running the seed under tsx crashed with
`ERR_PACKAGE_PATH_NOT_EXPORTED: './en-us' … @react-pdf/hyphenate`. Root
cause: first time the PDF integration executes outside a bundler — Next and
Vite tolerate @react-pdf's internal subpath imports; Node's strict `exports`
resolution does not. Fix: run the seed with `vite-node` (same resolution as
the test suite, which already renders PDFs happily). Seed command became
`vite-node -c vitest.config.mts prisma/seed.ts`.

Verified: local seed creates both apps with real PDFs; second run skips
idempotently; **production seed** run with the Blob token + prod APP_URL —
both PDFs on `*.public.blob.vercel-storage.com`; guardrail added that skips
application-seeding when the DB is remote but no Blob token is present
(local-storage URLs must never land in a remote DB).

## Production QA (no src/ changes required)

- Dashboard shows the three staged applications; Meera's review page offers
  I Agree; Rohan's shows the agreed state.
- **Second-agent isolation with a real account:** signed up
  `qa-isolation-agent@…` via the live form (short-password attempt correctly
  re-rendered with an error first), logged in → empty dashboard, 404 on
  Meera's customer id and on the ACTIVE application id. Account deleted
  afterwards.
- **Webhook idempotency on real infra:** re-POSTed the *stored raw payload*
  of the genuine paid event, signed with the production secret → 200
  `already_active`, policy count still exactly 1.
- Wrong password → 302 with **no session cookie**; forged-signature webhook
  400 (re-verified earlier); prod env audit: exactly the 9 expected vars,
  no TEST_DATABASE_URL.

## Documentation

- README rewritten from the verified final state (live URL, credentials,
  walkthrough with the **domestic** payment instructions we actually
  validated, service-mode matrix, architecture summary, local setup, env
  docs, limitations). Small archaeology find: the Phase-4 "status" update to
  the README had silently no-opped (a regex expected a line break that wasn't
  there) — README had stayed at "Phase 3". Moot after the rewrite, recorded
  for honesty.
- SECURITY-REVIEW final pass with the production-QA evidence + a rotation
  note (Razorpay key, Neon password and one superseded AUTH_SECRET passed
  through the dev chat; rotate after review).
- TESTING.md ship results, DECISIONS D-27, WALKTHROUGH.md (12-minute script).

## Final verification (walkthrough dry run on production)

Fresh customer → eligibility panel → quote → Blob PDF (`%PDF` bytes) →
review page → I Agree — all through the live UI (form replays). Walkthrough
rows cleaned afterwards; demo data back to exactly 5 customers / 3
applications / 1 (real) policy.

**Failure during the dry run, reported then fixed:** the payment-link step
401'd — but only in the local harness. Root cause: the Razorpay vars are
stored as *sensitive* in Vercel, and `vercel env pull` returns an 11-char
placeholder for those (the Blob token pulled fine because the store
integration added it as plain config). Production, which reads the real
values natively, was never affected — re-verified by creating and cancelling
a real link with the actual keys, and the full payment→policy chain was
already proven live (POL-2026-000002) with idempotent replay. Lesson filed:
never assume `env pull` output is usable for secrets marked sensitive.

Final local gate: 65/65 tests, typecheck, lint, production build — results
in the ship report.
