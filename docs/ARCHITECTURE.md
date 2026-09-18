# Architecture — Insurance Agent Platform MVP

Status: finalized in Phase 0 (2026-09-18). See `ai-logs/01-planning-phase0.md`
for the options considered and rejected.

## Shape

**A server-first Next.js monolith deployed as serverless functions on Vercel**,
with a pure business core and mode-switched integration adapters.

Options considered:
- **A. Next.js monolith (chosen)** — one repo/deploy, shared types, webhooks as
  route handlers, JD-aligned stack.
- **B. Next.js + separate backend** — rejected: two deploys, duplicated
  types/validation, no benefit for a solo one-week MVP.
- **C. "Serverless architecture"** — on Vercel, A *is* serverless; C collapses
  into A. Only real content: design within serverless constraints (stateless
  handlers, pooled DB connections, no headless browser for PDFs).

`lib/domain` + `lib/integrations` are the extraction seams if a standalone
service is ever needed — the monolith is a deployment choice, not a coupling
choice.

## Server-first rules

- **Server Components for all reads.** No client-side data fetching layer, no
  REST GET endpoints for our own pages.
- **Server Actions for all agent/customer mutations.**
- **Route Handlers only where an external machine calls us**: 
  `/api/webhooks/razorpay` and `/api/auth/[...nextauth]`. That is the entire
  hand-written HTTP surface.
- **The client is never trusted with business truth.** If the client lies
  (edited fields, replayed requests, re-enabled buttons), the server re-checks
  eligibility, uses only the frozen premium, and rejects illegal transitions.

## Module structure & dependency rule

```text
src/
├── app/                  # routes: presentation only
├── components/           # shared UI
├── actions/              # server actions: thin orchestration only
├── lib/
│   ├── domain/           # BUSINESS CORE — pure or DB-only; no HTTP, no vendor SDKs
│   │   ├── eligibility.ts        # pure
│   │   ├── premium.ts            # pure
│   │   ├── applications.ts       # the ONLY module that changes application status
│   │   └── activation.ts         # verified payment → policy, one transaction
│   ├── integrations/     # external IO behind small interfaces + mode flags
│   │   ├── payments/razorpay.ts
│   │   ├── messaging/whatsapp.ts # demo (wa.me) | cloud-api
│   │   ├── email/resend.ts       # live | log
│   │   └── pdf/
│   ├── db.ts             # Prisma client singleton
│   ├── auth.ts           # Auth.js config
│   ├── session.ts        # requireAgent()
│   ├── config.ts         # zod-validated env, fail fast
│   └── validation/       # zod schemas shared by forms and actions
└── tests/                # unit tests target lib/domain
```

**Dependency rule:** `app → actions → domain → integrations/db`, never
backwards. Server actions stay thin: validate → authenticate → authorize →
one domain call → revalidate. An action longer than ~15 lines means logic is
leaking out of the domain.

## Route map = trust zones

```text
app/
├── (auth)/        login, signup            # public
├── (agent)/       dashboard, products,     # Zone 1: session-guarded
│                  customers/…, applications/…
├── review/[token]/                         # Zone 2: capability token
└── api/
    ├── auth/[...nextauth]/                 # Auth.js
    └── webhooks/razorpay/                  # Zone 3: HMAC-authenticated
```

## Auth & authorization boundaries

- **Zone 1 — Agent (session).** Auth.js credentials + bcrypt, httpOnly cookie.
  Two layers: routing guard (UX only) and **enforcement in the data layer** —
  every query is `WHERE id = ? AND agent_id = session.agentId`; wrong owner
  returns not-found (no existence oracle).
- **Zone 2 — Customer (capability token).** 128-bit random review token = the
  credential. Grants: read one application's quote view + exactly one
  transition (`QUOTE_GENERATED → AGREED`). Nothing else.
- **Zone 3 — Machine (HMAC).** Webhook has no session; the Razorpay signature
  verified against the raw body IS the authentication. Invalid → 400, nothing
  executes.

Repository shape (from schema pressure test): exactly two application
fetchers — `getApplicationForAgent(id, agentId)` and
`getApplicationByToken(token)`. Child records (payments, policy,
communications) are only loaded off an application returned by one of these.

## Where business logic lives

| Logic | Home | Why |
|---|---|---|
| Eligibility | `domain/eligibility.ts` (pure) | unit-testable; same function feeds the profile panel and the create-quote guard |
| Premium | `domain/premium.ts` (pure) | computed once, frozen on application |
| Status transitions | `domain/applications.ts` | single chokepoint; conditional updates implement the transition table |
| Webhook signature | `integrations/payments/razorpay.ts` | vendor crypto plumbing, swap seam |
| Payment validity decision (amount/currency/status) | `domain/activation.ts` | business rule, not vendor code |
| Policy activation | `domain/activation.ts` — one transaction; email post-commit | called by BOTH webhook and reconcile button — one code path |

## External services

| Service | Direction | Mode switch |
|---|---|---|
| Neon Postgres | out (Prisma, pooled) | — |
| Razorpay | out (create/cancel link, fetch status) + in (webhook) | test keys |
| Vercel Blob | out (PDF storage) | — |
| Resend | out (confirmation email) | `EMAIL_MODE=live\|log` |
| WhatsApp | client-side (server renders + logs; browser opens wa.me) | `WHATSAPP_MODE=demo\|cloud-api` |

Every integration is a leaf. Every integration has an explicit mode declared in
`config.ts` and echoed in the README service matrix.
