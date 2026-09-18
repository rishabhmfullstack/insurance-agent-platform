# AI Log 05 — Phase 4: Payments, Webhook, Policy Activation, Email

Date: 2026-09-18 · Tool: Claude Code (Claude Fable 5)

**Objective:** Razorpay test-mode payment links behind the provider seam,
signature-verified webhook, atomic activation (payment PAID + policy + ACTIVE),
reconcile safety net on the same code path, confirmation email with resend.
Constraint: **no Razorpay account exists yet** — everything testable had to be
tested with signed fixtures and a mode-switched mock.

## Structural decisions

1. **Workflow layer added (D-23).** Webhook route, reconcile and agent actions
   share generate/regenerate/process/activate/email flows. Duplicating that
   orchestration across callers is exactly how a "safety net" drifts from the
   primary path — `lib/workflows/payment-flow.ts` is the single home, and the
   reconcile button provably reuses `activateFromVerifiedPayment` because
   there is only one of it.
2. **Activation contract implemented as designed in the pressure test:** the
   transaction's FIRST statement is the rows-affected-checked payment claim;
   policy number from the DB sequence; unique policy + unique
   provider_payment_id as backstops; app-status update failure rolls the whole
   transaction back. Email is dispatched post-commit and cannot touch truth.
3. **Schema gap found: `payments.short_url` (D-24).** The review page and the
   WhatsApp message need the payable URL; it's provider-issued. Second
   migration. A reminder that consuming UI finds gaps schema review can't.
4. **Mock provider (D-25):** same interface, inert URLs, test helpers for
   provider-side paid/expired. Deliberately impossible to mistake for real.
5. **Provider-cancel failure aborts regenerate** — my first draft cancelled
   locally even if the provider call failed; that leaves a payable link on a
   CANCELLED row = the double-payment trap re-opened. Fixed to fail closed.

## Tests (65 total; 19 new — all mandatory scenarios covered)

Highest-value property: webhook tests go **through the actual route handler**
(`POST(new Request(...))`) with real HMAC signatures over the raw body — so
signature verification, tampered-body rejection, parsing, dispatch, activation,
idempotency and anomaly handling are all exercised exactly as deployed. The
concurrency test races two activations with `Promise.all` and asserts exactly
one `activated` + one policy row. Email hard-failure is isolated in its own
file with a mocked send layer: policy/payment untouched, FAILED comm with the
error, attempts recorded.

## Manual E2E (mock provider, real server)

Continued Phase 3's agreed application: link generated → both agent and
customer views show payment-pending state with the link → webhook with a bad
signature rejected 400 → **correctly signed webhook to the running server →
`{"note":"activated"}`** → policy POL-2026-000005 on both views, payment PAID
with provider payment id, confirmation email LOGGED in communications →
duplicate webhook → `already_active`, still one policy → resend form replay →
second comm row. (Comedy note: the first resend replay grabbed the page's
first `$ACTION_ID`, which is the sign-out button — logged myself out. The
form-replay technique needs the form that contains the `applicationId` field.)

## Remaining to verify against the REAL Razorpay test API (needs account keys)

- Payment-link create/cancel/fetch response shapes (adapter written to docs;
  `fetchLinkStatus` mapping of `payments[]` in particular).
- Dashboard-delivered webhook (headers, exact payload nesting) vs fixtures.
- Test-card checkout UX + callback redirect to /review/[token].
- Webhook secret configuration against the deployed URL.
These are isolated inside `integrations/payments/razorpay.ts` by design — the
domain, workflows, route and tests do not change when this is verified.
