# Insurance Agent Platform — MVP

An agent-operated insurance sales tool: agents create customers, see which
products they qualify for, generate personalized quote PDFs, share them via
WhatsApp, capture agreement, take payment through a verified payment link, and
issue policies with email confirmation.

> **Demo application.** All data is fictional; payments run in Razorpay test
> mode; no real insurance is offered.

**Status: Phase 1 — foundation** (auth, schema, protected shell). The full
flow lands in subsequent phases; this README's run/deploy sections are
finalized at ship time.

## Documentation

Planning-first workflow — the docs were written and committed **before** the code:

- [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) — requirements, scope, assumptions
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — architecture, trust zones, module rules
- [docs/DATABASE.md](docs/DATABASE.md) — schema, state machine, invariants
- [docs/DECISIONS.md](docs/DECISIONS.md) — ADR-style decision log
- [docs/TESTING.md](docs/TESTING.md) — test strategy
- [docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md) — security checklist (MVP vs deferred)
- [docs/ai-logs/](docs/ai-logs/) — the AI-assisted development log, one entry per work session

## Stack

Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind ·
PostgreSQL (Neon) · Prisma 6 · Auth.js v5 (credentials + bcryptjs) · zod

## Run locally

```bash
npm install
cp .env.example .env       # fill DATABASE_URL (any Postgres) + AUTH_SECRET
npx prisma migrate deploy  # applies prisma/migrations (incl. raw-SQL constraints)
npx prisma db seed         # demo agent
npm run dev
```

Checks: `npm run typecheck` · `npm run lint` · `npm run build`

## Demo credentials (seeded)

| Role | Email | Password |
|---|---|---|
| Agent | `agent@demo.example.com` | `Agent@Demo1` |

## Environment variables

See [.env.example](.env.example) — currently `DATABASE_URL`, `AUTH_SECRET`,
`APP_URL`; the payment/email/WhatsApp variables and their modes are documented
there in advance and wired in later phases.
