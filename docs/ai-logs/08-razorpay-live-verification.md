# AI Log 08 — Phase 5 complete: Real Razorpay test-mode verified end-to-end

Date: 2026-09-18 · Tool: Claude Code (Claude Fable 5, driving Vercel CLI +
Razorpay REST API; owner did signup/OTP/PAN and clicked the test-bank Success)

## Setup performed programmatically

- Test keys added to Vercel (`RAZORPAY_KEY_ID/SECRET`) → redeploy → provider
  flipped mock → real automatically (derived mode, D-25).
- **Webhook created via the Razorpay API** (no dashboard clicking):
  `POST /v1/webhooks` — note: `events` must be an **object map**
  (`{"payment_link.paid": true, …}`); an array is rejected with
  "Invalid event name/names: 1, 2". Verified active with exactly our 3 events
  and the production secret set earlier.

## Real-API adapter verification (the ai-log 05 deferred list — all cleared)

- createPaymentLink → real `rzp.io` short URL ✓
- fetchLinkStatus: `created` ✓ · `cancelled` after cancel ✓ ·
  **`paid` mapping ✓** — `payments[]` array parsed to
  `{paymentId, amount, currency}` matching the webhook's values exactly.
- cancelPaymentLink ✓ (also used to tidy throwaway probe links).
- **Real-API quirk found:** fully-recurring contact numbers
  (`+919999999999`) are rejected ("Recurring digits in customer contact are
  disallowed"). Our seeded numbers pass; avoid all-same-digit placeholders.
- **Checkout quirk found:** `4111…` is treated as an international card and
  new test accounts have international cards disabled — demo instructions
  must use Netbanking-Success, UPI `success@razorpay`, or the domestic
  Mastercard test number. Goes into the README test-payment section.

## The live end-to-end payment (production, real webhook)

Aarav's agreed application → `generatePaymentLink` via the real workflow
(₹8,000 link `plink_TdZ3Fj1ZEsTr7Z`, app → PAYMENT_PENDING, reconcile said
`still_pending`) → both prod views showed the link → owner paid via test
Netbanking Success → **Razorpay's real webhook hit the prod endpoint,
signature verified, activation transaction ran**:

- application ACTIVE · policy **POL-2026-000002** (2026-09-18 → 2027-09-18),
  exactly one policy row
- payment PAID, providerPaymentId `pay_TdZ7pJQmxgPoZa`, raw webhook payload
  stored for audit
- confirmation email LOGGED in communications (EMAIL_MODE=log)
- customer review page and agent view both render the active-policy state
- reconcile after payment → `already_active` (idempotent, same path)

Phase 5 is complete: the deployed application runs the entire assignment flow
on real infrastructure (Neon, Vercel, Blob, Razorpay test mode). Remaining
for ship: README finalization (credentials, service-mode matrix, reviewer
walkthrough incl. domestic-payment instructions), seed polish, final QA.
