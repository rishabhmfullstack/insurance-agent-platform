# Interview Walkthrough — 12-minute script

Demo-first: interviewers disengage during slide-style preambles, so the live
flow carries the narrative and the architecture rides along. Numbers in
[brackets] are cumulative minutes.

## 0. One-line setup [0:00–1:00]

> "The brief was an insurance agent platform — signup to policy issuance —
> shipped fast. I optimized for a **complete, verified loop over feature
> count**: every step you'll see runs on real infrastructure — Neon Postgres,
> Vercel, Vercel Blob, and Razorpay's real test-mode API with
> signature-verified webhooks. And the repo documents the second thing you
> asked about: how I used AI as an engineering partner — the planning docs
> were committed before any code."

Have open: the live app (logged in), the GitHub repo, the Razorpay dashboard
(test mode) in a background tab.

## 1. Live demo — the money path [1:00–7:00]

1. **Dashboard** — 5 demo customers, 3 applications in different stages.
   Point at POL-2026-000002: "that policy is real test-mode money — issued by
   the production webhook, not seeded. The seed only creates pre-payment
   states, deliberately."
2. **Customer profile (Meera, 63)** — the eligibility panel: *"Both health
   products — she's in the 60–65 overlap band — but term says 'Age 63
   exceeds the maximum 60'. Rules are data on the product; one pure function
   evaluates them, and the same function guards quote creation server-side,
   so the panel and the guard can't disagree."*
3. **Create a fresh customer** (30yo non-smoker, ₹6L income) → eligible cards
   with premiums. *"Premium = base × age band × factors, computed once and
   frozen on the application — the PDF, the review page, the payment link and
   the webhook check all read that single stored number."*
4. **Create Quote** → application screen. Open the **PDF** (Vercel Blob):
   *"generated once from frozen data — it can never disagree with what the
   customer pays."*
5. **Share on WhatsApp** → wa.me opens prefilled. *"Demo click-to-chat mode,
   labeled as such. Meta's Cloud API needs business verification and template
   approval — days of external lead time — so I built the provider seam and
   shipped the honest mode. The message is logged in the communications
   audit trail either way."*
6. **Review link in incognito** — *"the customer never logs in; this 128-bit
   token is the credential, and the query behind this page selects only
   name, product and premium — PII minimization enforced by the query shape,
   not the template."* Click **I Agree**.
7. **Generate Payment Link** → open it → pay via **Netbanking → Success**.
   Flip back: **Policy Active, sequential policy number, email in the comms
   log.** *"That state change came from Razorpay's webhook hitting my
   endpoint: HMAC over the raw body, amount and currency checked against the
   frozen premium, then one transaction — claim the payment
   rows-affected-first, draw the policy number from a DB sequence, activate.
   The redirect you just saw only reads state; it can't activate anything."*

## 2. One prepared deep-dive: the webhook + activation [7:00–9:00]

Show `api/webhooks/razorpay/route.ts` (~25 lines) then
`domain/activation.ts`:

- Raw body before parsing; 400 only for bad signatures; 200 for everything
  verified — duplicates, ignored events, logged anomalies — so the provider
  stops retrying.
- Idempotency in layers: rows-affected-first claim → unique
  `provider_payment_id` → unique policy-per-application as the DB backstop.
  *"We race-tested two concurrent activations: exactly one 'activated', one
  policy row."*
- *"The 'Verify Payment Status' button — the missed-webhook safety net —
  calls this same function. One code path, so the safety net can't drift."*

## 3. Architecture + data, fast [9:00–10:30]

ARCHITECTURE.md diagram: server-first Next.js monolith, three trust zones,
`app → actions → workflows → domain | integrations`, and the state machine
with one backward edge (payment failure). DATABASE.md: *"the interesting
constraints are partial unique indexes — one open application per
customer+product, one open payment link — plus a composite FK that makes
cross-tenant inconsistency impossible by construction, and a
consent-before-money CHECK."*

## 4. The AI-assisted process [10:30–11:30]

Git history: docs commit **before** the scaffold. DECISIONS.md (27 entries) —
pick two where review changed the design: *"the pressure test deleted two
states from my own accepted state machine (SENT gated nothing, DECLINED was
unreachable) and turned a denormalization into a composite FK. The AI logs
record failures too — tests once ran against the remote database and the fix
was a fail-closed guard, same philosophy as the payment path."*

## 5. Honest gaps + close [11:30–12:00]

SECURITY-REVIEW.md deferred list: rate limiting, token hashing at rest,
signed short-lived PDF URLs, refund automation — *"named, not half-built."*
Out of scope: customer accounts, admin, real underwriting.

> "Small, complete, deployed, and every claim in the README is something we
> actually verified on production."

## Likely Q&A

- **Why monolith?** One dev, one week; module seams (`domain`,
  `integrations`, `workflows`) are the extraction points — deployment choice,
  not coupling.
- **Why not real WhatsApp API?** External approval lead time vs. honest demo
  mode behind the same interface; flag-flip when credentials exist.
- **Race conditions?** Conditional-update transitions + partial unique
  indexes + the concurrency test; DB is the arbiter.
- **What breaks at scale first?** Serverless DB connections (pooled Neon
  helps; pgbouncer flag set), then PDF rendering in request path (move to a
  queue), then the comms table needing pagination.
- **Prisma 7 / Next 16?** Pinned Prisma 6 mid-build when npm resolved a
  fresh major with a changed client architecture — stability over novelty on
  a deadline, recorded as D-16.
