# Insurance Agent Platform — MVP

An agent-operated insurance sales tool covering the full journey: agents
create customers, see which products they qualify for (with reasons),
generate personalized quote PDFs, share them via WhatsApp, capture the
customer's consent on a tokenized review page, take payment through a real
(test-mode) Razorpay payment link, and issue policies automatically when the
signature-verified webhook confirms payment — with email confirmation.

> **Demo application.** All customer data is fictional, payments run in
> Razorpay **test mode** (no real money), and no real insurance is offered.

## 🔗 Live demo

**https://insurance-agent-platform-lemon.vercel.app**

| Role | Email | Password |
|---|---|---|
| Agent | `agent@demo.example.com` | `Agent@Demo1` |

(Signup also works if you prefer a fresh account — new agents see only their
own customers.)

> Note: the database sleeps on the free tier — the very first request can take
> 1–3 seconds.

## 🚀 5-minute reviewer walkthrough

1. **Log in** with the credentials above. The dashboard shows 5 demo
   customers and 3 applications in different stages — one quote awaiting the
   customer, one agreed awaiting payment, and one **genuinely completed
   policy (POL-2026-000002)** issued by a real test-mode payment through the
   production webhook (not seeded).
2. **Products** — browse the catalogue; each product lists its eligibility
   criteria in plain words.
3. **Create a customer** (Dashboard → New Customer) — e.g. a 30-year-old
   non-smoker with income ₹6,00,000. Try a 17-year-old or income ₹1,00,000 to
   see eligibility exclusions with human-readable reasons.
4. **Create a quote** from an eligible product card on the customer profile →
   you land on the application workflow screen: status timeline, premium, and
   the **personalized PDF** (stored on Vercel Blob).
5. **Share on WhatsApp** — opens wa.me with the message prefilled
   (*demo click-to-chat mode, honestly labeled — see the service matrix
   below*). Every share is recorded in the communications log.
6. **Open the customer review link** (shown on the application page — use an
   incognito window to experience the customer's view; note it exposes only
   name + product + premium). Click **I Agree**.
7. Back on the agent view: **Generate Payment Link** → share or open the
   real Razorpay test link.
8. **Pay** on Razorpay's hosted page — *use a domestic test method*:
   - **Netbanking** → any bank → click **Success** on the demo bank page
     *(easiest)*, or
   - **UPI** → `success@razorpay`, or
   - **Card** → `5267 3181 8797 5449`, any future expiry, any CVV.
   - ⚠️ `4111 1111 1111 1111` will FAIL — it counts as an international card,
     which is disabled on this test account.
9. Within seconds the **real webhook** fires: the application flips to
   **Policy Active** with a sequential policy number, the payment shows as
   verified, and the confirmation email appears in the communications log.
   The customer's review link now shows the active policy too.
10. Try to break it: a garbage review token → uniform 404; another agent's
    URLs → 404; the redirect back from the payment page never activates
    anything — only the verified webhook (or the "Verify Payment Status"
    reconcile button, which uses the same code path) does.

## 🧭 Service & mode matrix (what's real vs. demo)

| Service | Mode on the deployment | Notes |
|---|---|---|
| Database | **Neon PostgreSQL (real)** | pooled connection; migrations applied manually |
| Payments | **Razorpay TEST mode (real API)** | real payment links, signature-verified webhooks, test money only |
| PDF storage | **Vercel Blob (real)** | unguessable public URLs |
| WhatsApp | **`demo` click-to-chat** | server renders + logs the real message; wa.me opens it in the agent's own WhatsApp. Meta Cloud API was deliberately not used (business verification + template approval lead time); the provider seam for it exists in `lib/integrations/messaging` |
| Email | **`log` mode** | confirmation emails are fully rendered into the communications log (visible in the UI). `live` mode via Resend is a flag flip |
| Payments fallback | mock provider (labeled, inert URLs) | **only** active when Razorpay keys are absent, i.e. local dev — never on the deployment |

Every mode is explicit configuration (`lib/config.ts`), labeled in the UI
where relevant, and honest — nothing pretends to be a production integration.

## 🏗 Architecture (short version)

**Server-first Next.js monolith** deployed as serverless functions on Vercel.

- **Reads** = Server Components; **mutations** = Server Actions; the only
  hand-written HTTP endpoints are the Razorpay webhook and Auth.js.
- **Three trust zones:** agent session (every query scoped by `agentId`),
  customer capability token (128-bit review link — grants viewing plus
  exactly one transition), machine HMAC (webhook raw-body signature).
- **Pure business core** (`lib/domain`): eligibility, premium (computed once
  and frozen at quote time), and a single state-machine chokepoint where
  every status transition is a conditional update. Payment activation is one
  transaction — claim payment (rows-affected-first) → policy number from a DB
  sequence → activate — used by **both** the webhook and the reconcile button.
- **Database constraints as guarantees:** partial unique indexes (one open
  application per customer+product; one open payment link per application),
  a composite FK preventing cross-tenant drift, CHECK constraints
  (consent-before-money, PDF-implies-generated, positive money), and a
  unique policy per application as the fail-closed backstop.

```text
app/ (routes, thin) → actions/ → workflows/ → domain/ | integrations/ → Postgres
                Zone 1: session · Zone 2: review token · Zone 3: webhook HMAC
```

Full detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
[docs/DATABASE.md](docs/DATABASE.md) (schema + state machine) ·
[docs/DECISIONS.md](docs/DECISIONS.md) (27 recorded decisions).

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind · PostgreSQL
(Neon) · Prisma 6 · Auth.js v5 + bcryptjs · zod · @react-pdf/renderer ·
Razorpay · Vitest.

## 💻 Run locally

```bash
npm install
cp .env.example .env        # local defaults work; set a 32+ char AUTH_SECRET
npm run db:local            # real PostgreSQL 18 on :5433, no Docker (keep it running)
npx prisma migrate deploy   # in a second terminal
npx prisma db seed          # demo agent, products, customers, sample applications
npm run dev                 # http://localhost:3000
```

Without Razorpay/Blob keys, local dev runs the **labeled** mock payment
provider and local PDF storage — the full flow still works (see the matrix).

**Checks:** `npm test` (65 unit + integration tests; integration tests
**refuse to run against a non-local database** — see `TEST_DATABASE_URL` in
`.env.example`) · `npm run typecheck` · `npm run lint` · `npm run build` ·
`npx tsx scripts/verify-schema.ts` (38 behavioral checks of every DB
constraint).

## 🔐 Environment variables

Documented inline in [.env.example](.env.example). The deployment sets:
`DATABASE_URL` (pooled Neon + `pgbouncer=true`), `AUTH_SECRET`, `APP_URL`,
`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
(matches the Razorpay dashboard webhook), `EMAIL_MODE=log`,
`WHATSAPP_MODE=demo`, `BLOB_READ_WRITE_TOKEN` (injected by the Vercel Blob
store).

Webhook: `POST /api/webhooks/razorpay`, registered for
`payment_link.paid|expired|cancelled`, HMAC-verified against the raw request
body before anything is parsed.

## 📚 Documentation & AI-assisted process

This project was built with an explicit AI-assisted engineering workflow —
planning docs were written and committed **before any code** (check the git
history), every decision is recorded, and the AI collaboration log is kept
per work session, including mistakes and their fixes:

- [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) — scope, assumptions, MVP cuts
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DATABASE.md](docs/DATABASE.md)
- [docs/DECISIONS.md](docs/DECISIONS.md) — ADR-style log (D-01…D-27)
- [docs/TESTING.md](docs/TESTING.md) · [docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md)
- [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) — the interview demo script
- [docs/ai-logs/](docs/ai-logs/) — 9 session logs: *AI suggested → I
  evaluated → accepted/rejected → implemented → tested*

## ⚠️ Known limitations (deliberate MVP scope)

No customer accounts, no admin UI, no real underwriting/KYC/claims, no
e-signatures, desktop-only. Production deferrals (rate limiting, token
hashing at rest, signed short-lived PDF URLs, audit tables, refund
automation) are listed honestly in
[docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md). Demo rules are
illustrative, not real insurance underwriting.
