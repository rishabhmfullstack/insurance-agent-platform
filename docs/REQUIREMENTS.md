# Requirements — Insurance Agent Platform MVP

Status: finalized in Phase 0 (2026-09-18). Source: assignment brief + planning session (see `ai-logs/01-planning-phase0.md`).

## Product summary

An **agent-operated insurance sales tool**: an agent logs in, creates a customer,
sees which products the customer qualifies for, generates a personalized quote PDF,
shares it via WhatsApp, captures the customer's agreement, shares a payment link,
and on **verified** payment the policy activates and the customer receives a
confirmation email. The customer never logs in — they interact through links.

Guiding constraint: **a reviewer must be able to test the full flow in ~5 minutes
from the Vercel URL using only the README.**

## Functional requirements

### Explicit (from the assignment)
1. Agent signup and login.
2. Browse insurance products (Term, Health, Vehicle, Other).
3. Create customer; view customer profile.
4. Determine applicable policies (eligibility).
5. Select a product for a customer.
6. Generate a personalized insurance PDF.
7. Share PDF via WhatsApp.
8. Customer reviews and agrees.
9. Generate + share payment link via WhatsApp.
10. Verify payment (backend-verified, not claimed).
11. Activate policy on verified payment.
12. Email confirmation to customer.
13. Deployed on Vercel, publicly accessible, seeded; README with credentials,
    env vars, and per-service configuration/mode.

### Inferred (our choices, labeled as such)
14. An **application** entity with a status lifecycle tracking the journey.
15. Deterministic **premium calculation** (required for PDF + payment amount).
16. A **public tokenized review page** where the customer views the quote PDF and
    clicks "I Agree" (assignment doesn't define the mechanism).
17. A **communications log** (channel, mode, content, timestamp) for auditability
    and demo legibility.
18. Agent dashboard listing own customers and applications with statuses.

## Non-functional requirements (MVP-scoped)

- **Security**: bcrypt password hashing, agent-scoped data access, webhook HMAC
  verification, unguessable capability tokens, no secrets in repo.
- **Payment-state correctness**: webhook is the source of truth; the UI never
  activates anything from a client-side redirect.
- **Reviewability**: seeded demo data; all third-party services run in
  test/demo mode with zero reviewer setup; modes documented in README.
- **Reliability (scoped)**: idempotent webhook handling; fail-closed states
  (no ACTIVE application without a verified payment row).
- **Maintainability**: one repo, one framework, typed end-to-end, small schema.
- Explicitly NOT engineered for: scale, uptime targets, mobile, i18n.

## MVP scope

### MUST HAVE
Agent auth · product catalogue (seeded) · customer CRUD (agent-scoped) ·
eligibility with human-readable reasons · application lifecycle · PDF generation
+ storage · WhatsApp share (demo click-to-chat mode) · public review page with
"I Agree" · Razorpay test-mode payment link + verified webhook · policy
activation + policy number · confirmation email (live/log mode) · seed script ·
Vercel deploy · README · docs/ + ai-logs maintained as we work.

### SHOULD HAVE
Status timeline UI · unit tests (eligibility, premium, webhook) · empty/error
states · copy-message fallback next to WhatsApp button.

### NICE TO HAVE
Playwright happy path · real Meta WhatsApp Cloud API mode · payment link
expiry/regenerate polish · dashboard stats.

### OUT OF SCOPE (deliberate)
Customer accounts/login · admin panel · product management UI · real
underwriting/KYC/claims/renewals · e-signatures · multi-currency · mobile
layout · queues/retries/rate limiting/observability stack.

## Key assumptions (full rationale in DECISIONS.md)

- Eligibility: simple deterministic per-product rules (age range, min income,
  vehicle flags). Demo rules, not underwriting — labeled as such.
- Premium: `base × ageBandFactor × productFactors`, annual, one-time payment,
  1-year policy term. Computed once at quote time and **frozen**.
- WhatsApp: `demo` mode = wa.me click-to-chat + communications log (honest,
  zero approval risk). Meta Cloud API behind the same interface as stretch.
- Payment: Razorpay test mode, Payment Links + webhooks.
- Email: Resend with `live | log` modes.
- Roles: **Agent only.** Customer = capability-token links. No admin (seed
  script is the admin).
- Customers are immutable after creation in MVP (kills stale-quote races).
- Quote validity: 30 days; expiry is lazy (no cron).
