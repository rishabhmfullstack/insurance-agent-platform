# Security Review — living checklist

Two tiers: **MVP-required** (built and verified before submission) and
**Production-deferred** (named honestly, deliberately not built). Final pass
happens in the hardening phase; boxes get checked as features land.

## MVP-required

### Authentication & sessions
- [x] bcrypt password hashing (bcryptjs, cost 10) — Phase 1
- [x] Generic login error (never reveal which field was wrong) — Phase 1
- [x] httpOnly session cookie via Auth.js; JWT session strategy — Phase 1
- [x] Emails lowercased before storage/lookup (no case-duplicate accounts) — Phase 1
- [x] Signup password minimum rules (zod, 8+ chars) — Phase 1

### Authorization
- [x] Every agent-zone query scoped `WHERE … AND agent_id = session.agentId` — Phase 2 (lib/data/*)
- [x] Wrong-owner lookups return not-found (no existence oracle) — Phase 2, verified over HTTP
- [x] Repository shape: only `getApplicationForAgent` / `getApplicationByToken` — Phase 3 (lib/data/applications.ts)
- [x] Composite FK prevents cross-tenant agent_id divergence — schema, Phase 1; behaviorally verified by scripts/verify-schema.ts (38/38)

### Input validation
- [x] zod on every server action / route handler input — Phase 2 (auth + customer actions)
- [x] Prisma parameterization (no raw string SQL in app code) — standing
- [x] JSONB rule configs zod-parsed at read time — Phase 2 (lib/data/products.ts)

### Payment integrity
- [x] Webhook HMAC verified against RAW body before any parsing/action —
      Phase 4, constant-time compare; tested with tampered-body fixtures
- [x] Amount + currency checked against frozen premium before activation —
      Phase 4, fail-closed (payment stays CREATED, anomaly logged)
- [x] Idempotency: provider_payment_id unique + rows-affected-FIRST activation
      transaction + unique policy backstop — Phase 4, concurrency-tested
- [x] Client redirect never writes state — review page reads DB truth only;
      activation exists solely in webhook + reconcile (one shared path)
- [x] Cancel-before-regenerate; provider-cancel failure aborts regeneration
      (fail closed, no two payable links) — Phase 4

### Tokens & customer data
- [x] Review token: crypto.randomBytes(16), unguessable, single-purpose — Phase 3
- [x] Review page renders minimal PII — enforced BY THE QUERY: the token-scoped
      select carries only the customer name (verified by integration test +
      HTTP leak check) — Phase 3
- [x] Referrer-Policy: no-referrer on /review/* — Phase 3, verified in headers
- [x] Uniform 404 for bad tokens — Phase 3, verified over HTTP
- [x] Demo data entirely fictional (stated in README) — Phase 2

### Secrets & config
- [x] Secrets only in env vars; `.env` gitignored; `.env.example` committed — Phase 1
- [x] Env validated at startup (zod, fail fast) — Phase 1
- [ ] Test-mode keys only; documented per-service mode matrix in README

## Production-deferred (named, not built)

- Rate limiting / login lockout / 2FA
- Review-token hashing at rest (tokens currently appear in platform request logs)
- Token expiry & rotation; session revocation
- Signed, short-lived PDF URLs (Blob URLs are unguessable but permanent)
- Encryption at rest for PII fields; DPDP/GDPR posture
- Full audit table (beyond communications log); admin tooling
- Automated refund handling for cancel/pay races (manual via dashboard in MVP)
- Secrets manager; key rotation
- CSP and hardened security headers beyond defaults
