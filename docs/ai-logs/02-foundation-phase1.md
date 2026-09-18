# AI Log 02 — Phase 1: Foundation

Date: 2026-09-18 · Tool: Claude Code (Claude Fable 5)

**Objective:** Project scaffold, git setup, Prisma schema + migration with the
raw-SQL constraints, env validation, Auth.js credentials auth, protected agent
shell, demo-agent seed. Foundation only — no product/customer/payment features.

**Context:** Phase 0 docs finalized and committed first (docs-before-code).

## What was done

- Repo initialized with local git identity before any commit; docs committed
  as commit #1, scaffold as #2.
- create-next-app (TypeScript, Tailwind, App Router, src dir) → resolved
  **Next.js 16.3.5**, newer than the 15.x assumed in planning. Accepted (D-17).
- Finalized Prisma schema (7 tables incl. composite FK) written from
  docs/DATABASE.md. Baseline migration generated **offline** via
  `prisma migrate diff --from-empty` (no live DB in this phase); the partial
  unique indexes, CHECK constraints and `policy_number_seq` appended as raw
  SQL to the same migration — applied later by `prisma migrate deploy`.
- Env validation (`lib/config.ts`, zod, fail-fast), Prisma singleton,
  Auth.js v5 credentials + bcryptjs, `requireAgent()`, (auth)/(agent) route
  groups, login/signup with `useActionState`, protected dashboard shell,
  idempotent seed with the README demo agent.

## AI recommendations & my evaluation

1. **npm resolved Prisma 7 (fresh major: new generator, required driver
   adapters, config relocation).** AI flagged the risk and recommended pinning
   to Prisma 6 for a timed assignment. Accepted → D-16. This is a
   stability-over-novelty call I want visible in the walkthrough.
2. **Middleware vs layout guard.** AI recommended dropping edge middleware:
   the (agent) layout + `requireAgent()` everywhere is the same enforcement
   with fewer moving parts (planning had already demoted middleware to "UX
   only"). Accepted → D-18.
3. **bcryptjs over native bcrypt** (no native builds on Windows/Vercel).
   Accepted → D-19.
4. **Seed upsert uses `update: {}`** so re-seeding never resets a changed
   demo password. Accepted.

## Issues hit & fixes

- `tsc` error in the Auth.js session callback: the `next-auth/jwt` module
  augmentation left `token.agentId` as `unknown` under truthiness narrowing.
  Fixed with a `typeof token.agentId === "string"` narrow (better than the
  cast the first suggestion used).

## Validation (all run locally)

- `prisma validate` ✓ (composite FK accepted)
- `tsc --noEmit` ✓ · `eslint` ✓ (no findings) · `next build` ✓
  (route table: `/`, `/login`, `/signup`, `/dashboard`, auth handler — exactly
  the planned surface)
- Smoke test against `npm start`: `/` → 307 `/dashboard` → 307 `/login` for
  anonymous; `/login` and `/signup` render 200 ✓
- bcryptjs round-trip: correct password verifies, wrong rejected ✓
- **Not run: migration + seed against a real database** — no local Postgres;
  Neon is provisioned in the deploy phase. The migration SQL was generated
  from the validated schema; the raw-SQL block is first exercised on the real
  DB (called out as an open risk for the next phase).

## Deviations from plan

- Next.js 16 instead of 15 (D-17); Prisma pinned to 6 (D-16); no edge
  middleware (D-18). All recorded in DECISIONS.md.
