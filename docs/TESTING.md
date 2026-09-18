# Testing Strategy

Status: strategy fixed in Phase 0; test code lands with the features it covers
(business-logic tests in the phase that writes the rules, not batched at the end).

## Priorities (highest interview value per hour first)

1. **Unit (Vitest)** — the pure domain core, which is pure *by design* for this
   reason:
   - `eligibility.ts`: every rule, boundary ages (17/18, 60/61 …), overlap cases.
   - `premium.ts`: age-band edges (30/31, 45/46, 59/60), factor stacking,
     round-once behavior.
   - webhook/activation logic: valid/invalid signature, duplicate delivery,
     amount mismatch, currency mismatch, already-processed payment.
2. **Integration** — a few route/action tests against a test DB: create
   customer, create application (server-side eligibility re-check), agree
   endpoint (token validation, idempotent re-click, expiry guard).
3. **Manual script** — the numbered reviewer click-through (kept in this file,
   final version in README), including Razorpay test cards.
4. **E2E (Playwright)** — happy path only, only if time remains.

## Critical happy path (must pass before submission)

login → create customer → eligibility panel → create quote → PDF renders →
wa.me opens with message → review page → Agree → payment link → test-card
payment → webhook fires on deployed URL → policy ACTIVE + number → email
sent/logged.

## Top failure cases to verify

- wrong password (generic error)
- accessing another agent's customer/application by URL → not-found
- ineligible product blocked server-side even if the request is forged
- invalid review token → neutral "link not valid"
- agree after validity → refused
- webhook with bad signature → 400, no state change
- duplicate webhook delivery → one policy (unique constraint backstop)
- payment failure → regenerate link path works
- email failure → policy still ACTIVE, comms row FAILED, resend available

## Status

- Phase 1 (foundation): checks were `tsc --noEmit`, ESLint, production build,
  HTTP smoke test.
- Phase 2: **32 Vitest unit tests** for eligibility + premium (all boundary
  ages, band edges, factor stacking, round-once behavior) — `npm test`.
  Plus `scripts/verify-schema.ts`: 38 behavioral checks of every DB constraint
  against a real PostgreSQL (partial uniques, CHECKs, composite FK, sequence).
  Manual HTTP flow verified: login → dashboard → products → customer profile
  (eligibility verdicts + premium previews exact), unknown-id 404, anonymous
  redirect, duplicate-phone rejection.
- Phase 3: **46 tests total.** New: integration tests for the state-machine
  chokepoint against the real DB (draft creation with frozen premium,
  server-side eligibility re-check, cross-agent not_found, duplicate-quote
  arbitration, attachPdf exactly-once, token access with minimal-PII select,
  agree + idempotency, expiry write-back freeing the unique slot, AGREED
  never expirable), a real PDF render test, and WhatsApp message/url units.
  NOTE: integration tests need DATABASE_URL + the local database running.
  Manual end-to-end over real HTTP (progressive-enhancement form replays,
  multipart): create quote → 303 to application → PDF bytes served → review
  page (anon) → I Agree POST → agreed state on both customer and agent views;
  duplicate create lands on the existing application; bad token 404;
  Referrer-Policy header present; PII leak grep on the review page came back
  empty.
- Phase 4: **65 tests total.** New (19): payment-flow integration against the
  real DB **through the actual webhook route handler with real HMAC
  signatures** — link creation only from AGREED with the frozen amount,
  open-link reuse (one open payment, server-enforced), invalid/missing/
  tampered signature → 400 with no state change, amount + currency mismatch →
  fail-closed anomaly, happy path → payment PAID + exactly one policy
  (POL-YYYY-NNNNNN) + ACTIVE + email comm, duplicate webhook → one policy,
  stale expired-event after PAID ignored, expired link → AGREED + fresh link,
  cancel-before-regenerate, concurrent activation race → exactly one
  'activated', reconcile: still_pending / provider-paid → activated via the
  SAME path / provider-expired → reverted, email hard-failure (mocked) →
  policy untouched + FAILED comm + resend attempts recorded.
  Manual E2E (mock provider): agreed application → link generated →
  PAYMENT_PENDING on agent + customer views → unsigned/bad-signature webhook
  400 → signed webhook to the RUNNING server → ACTIVE + policy number on both
  views + LOGGED email → duplicate webhook "already_active", one policy →
  resend-email form replay → second comm row.
  Remaining for real-API verification (needs Razorpay test keys): payment-link
  create/cancel/fetch response shapes, live dashboard webhook delivery, test-
  card checkout UX, callback redirect. Tracked in ai-logs/05.
