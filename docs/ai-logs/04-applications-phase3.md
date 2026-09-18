# AI Log 04 — Phase 3: Application Flow, PDF, Review Page, WhatsApp Demo

Date: 2026-09-18 · Tool: Claude Code (Claude Fable 5)

**Objective:** The quote lifecycle end-to-end short of payment: create
application (frozen premium, state machine, duplicate guard), personalized
PDF, tokenized review page with "I Agree", demo WhatsApp share with
communications logging, application workflow screen. No Razorpay/policy/email.

## Key structural decisions this session

1. **PDF orchestration split to respect the dependency rule.** First instinct
   was `createQuote()` doing draft + PDF in one domain call — but domain must
   not import integrations. Final shape: `createDraftQuote` (domain) →
   `generateAndStoreQuotePdf` (integration) → `attachPdf` (domain transition),
   orchestrated by the action. Bonus: the retry path reuses exactly the same
   two calls, and a PDF failure cleanly strands the row in DRAFT (the CHECK
   constraint guarantees DRAFT is the only PDF-less state).
2. **PDF breakdown from the same pure function.** Added `premiumBreakdown()`
   and made `computePremium()` its total — the PDF's factor lines and the
   frozen premium literally cannot diverge.
3. **Minimal PII enforced by the query, not the template.** The token-scoped
   fetcher selects only the customer's NAME — dob/income/phone/email never
   cross the Zone-2 boundary, so no future template edit can leak them.
   Verified by an integration test asserting the exact shape, plus an HTTP
   grep for leaks (came back empty).
4. **"₹" cannot be encoded by the standard PDF fonts** (Helvetica/WinAnsi) —
   money renders as "Rs." in the PDF rather than bundling a font file.
   Deliberate MVP trade, noted in the template.
5. **Storage mode is derived, not declared:** Blob token present → blob mode;
   absent → local file fallback served by a whitelisted dev-only route.
   The deployed app always runs blob mode.

## Tests (46 total, all passing)

New integration suite runs the state machine against the REAL local Postgres:
frozen-premium equality with the pure function (₹15,600 exact), server-side
eligibility re-check, cross-agent access → not_found, duplicate-quote
arbitration returning the existing id, attachPdf exactly-once, agree +
idempotent repeat, expiry: derived check → agree refused → EXPIRED write-back
→ unique slot freed → re-quote succeeds, and **AGREED is never expirable**
(the pressure-test rule, now a test). Plus a real PDF render (bytes start
"%PDF-") and WhatsApp unit tests.

## Manual end-to-end (real HTTP, no shortcuts)

Next.js server-action forms work without JS (progressive enhancement), so the
whole flow was driven with curl replaying the rendered forms: login → create
quote (303 to the new application) → application page shows Quote ready +
share button labeled "Demo mode (click-to-chat)" → PDF served (%PDF-1.3) →
duplicate create POST lands on the SAME application → review page over an
anonymous request → I Agree multipart POST (303) → "You agreed to this
quote" → agent view shows Customer agreed. Bad token → 404; Referrer-Policy:
no-referrer confirmed on /review/*.

**Gotcha found:** the agree POST silently no-ops as urlencoded — Next 16
accepts server-action form posts as **multipart/form-data** (what browsers
send). Worth knowing for any future webhook-style testing of actions.

## Issues hit & fixes

- `renderToBuffer` type friction in the test (createElement's inferred props
  vs DocumentProps) — safe cast with a comment.
- pdf/index needed to be `.tsx` (JSX in the render call).
- Left-over from the manual test: Aarav has an AGREED application in the local
  DB — kept deliberately as mid-flow demo state; the Phase-6 seed adds an
  equivalent officially.
