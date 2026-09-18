# Database Design — Insurance Agent Platform MVP

Status: finalized in Phase 0 (2026-09-18), including the pressure-test deltas.
PostgreSQL via Prisma. All money is **BIGINT paise** (one unit convention,
integer math, matches Razorpay natively). All PKs are UUIDs. All FKs are
`ON DELETE RESTRICT` (no deletes in MVP).

## ER overview

```text
agents 1──* customers 1──* applications *──1 products
                              │ 1──* payments
                              │ 1──1 policies        (UNIQUE application_id)
                              └ 1──* communications
```

## Application state machine (final)

```text
DRAFT ──PDF stored──► QUOTE_GENERATED ──"I Agree" (within validity)──► AGREED
  │                        │                                            │ ▲
  │ (lazy, valid_until     │ (lazy)                 generate pay link   │ │ payment FAILED/EXPIRED
  ▼  passed)               ▼                                            ▼ │ (old link cancelled)
EXPIRED ◄──────────────────┘                                   PAYMENT_PENDING
                                                                        │ webhook verified:
                                                                        │ signature ✓ amount ✓ currency ✓
                                                                        ▼
                                                                     ACTIVE (terminal)
```

Allowed transitions (exhaustive; anything else rejected server-side):

| From | To | Trigger | Guard |
|---|---|---|---|
| — | DRAFT | create quote | eligible; no open app for customer+product |
| DRAFT | QUOTE_GENERATED | PDF stored (auto/retry) | — |
| QUOTE_GENERATED | AGREED | customer "I Agree" via token | within validity; conditional update |
| AGREED | PAYMENT_PENDING | agent generates payment link | no open payment |
| PAYMENT_PENDING | AGREED | payment fails/expires | old link cancelled |
| PAYMENT_PENDING | ACTIVE | verified PAID (webhook or reconcile) | sig+amount+currency; one txn; unique policy |
| DRAFT / QUOTE_GENERATED | EXPIRED | lazy write-back on read paths | `valid_until < now()` |

`AGREED`/`PAYMENT_PENDING` are **never** expirable — validity gates acceptance,
not payment. WhatsApp shares are logged **events**, not states. Every
transition is a conditional update (`… WHERE id = ? AND status = expected`) in
`domain/applications.ts` — the only module allowed to change status.

Payment states: `CREATED → PAID | FAILED | EXPIRED | CANCELLED` (all terminal;
never regress — makes out-of-order webhook events harmless).

## Tables

### agents
id · name · email UNIQUE (lowercased in app before insert) · password_hash (bcrypt)

### customers  — immutable after creation (application rule)
id · agent_id FK · name · phone · email · dob DATE · annual_income BIGINT ·
city · is_smoker BOOL · owns_vehicle BOOL · vehicle_year SMALLINT NULL
- UNIQUE (agent_id, phone)
- **UNIQUE (id, agent_id)** — target for the composite FK below
- CHECK: `owns_vehicle = false OR vehicle_year IS NOT NULL` (evaluator is total)
- index (agent_id)

### products — seeded, immutable in MVP
id · category ENUM(TERM|HEALTH|VEHICLE|OTHER) · name · description ·
coverage_amount BIGINT · base_premium BIGINT ·
eligibility_rules JSONB · premium_factors JSONB
- Rules-as-data, evaluated by one pure function; jsonb shape zod-parsed at read.
- CHECK: base_premium > 0 AND coverage_amount > 0

### applications — the workflow spine
id · agent_id · customer_id · product_id · status ENUM ·
premium_amount BIGINT (**frozen at creation** — single source for PDF, review
page, payment link, webhook amount check) · valid_until (creation + 30 days) ·
review_token UNIQUE (128-bit random; identifier and capability deliberately
separate columns) · pdf_url NULL (null exactly while DRAFT) · agreed_at NULL
- **Composite FK (customer_id, agent_id) → customers (id, agent_id)** — an
  application can only carry its customer's true agent; cross-tenant
  consistency by construction, not code discipline.
- **Partial unique: (customer_id, product_id) WHERE status <> 'EXPIRED'** —
  one live application per customer+product (ACTIVE blocks re-quoting too).
- CHECK: `status = 'DRAFT' OR pdf_url IS NOT NULL`
- CHECK: `status IN ('DRAFT','QUOTE_GENERATED','EXPIRED') OR agreed_at IS NOT NULL`
- CHECK: premium_amount > 0
- indexes: (agent_id, created_at DESC), (customer_id)

### payments
id · application_id FK · provider_link_id UNIQUE · short_url (payable URL —
provider-issued, needed by the review page + WhatsApp message; added in
migration 2, D-24) · provider_payment_id UNIQUE NULL (set by webhook — **the
idempotency anchor**; Postgres allows many NULLs) · amount BIGINT (copied from
frozen premium) · currency CHAR(3) 'INR' · status ENUM ·
raw_webhook_payload JSONB NULL (audit: the bytes that activated a policy)
- **Partial unique: (application_id) WHERE status = 'CREATED'** — at most one
  open link; regenerate must cancel first ⇒ double-payment structurally blocked.
- CHECK: amount > 0

### policies
id · application_id FK **UNIQUE** (fail-closed backstop: one policy per
application, even under concurrency bugs) · policy_number UNIQUE
(`POL-2026-000123`, from Postgres SEQUENCE `policy_number_seq` — no max+1) ·
start_date · end_date (+1 year)
- No status column: a policy row exists only as active; term end derivable.

### communications — append-only audit trail
id · application_id FK · channel ENUM(WHATSAPP|EMAIL) ·
mode ENUM(DEMO|LIVE|LOG) (the honesty column) · template_key · recipient ·
rendered_content · status ENUM(LOGGED|SENT|FAILED) · error NULL
- index (application_id, created_at)

## Invariants → mechanisms

| Invariant | Mechanism |
|---|---|
| No duplicate open application per customer+product | partial unique index (create action catches unique-violation → friendly message) |
| One open payment link; no double-pay path | partial unique + cancel-before-regenerate |
| Duplicate webhook ⇒ no double activation | unique provider_payment_id + unique policies.application_id + conditional updates in one txn; activation's FIRST statement is the rows-affected-checked payment update |
| Cross-tenant leakage impossible via denormalized agent_id | composite FK |
| Consent recorded before money moves | agreed_at CHECK |

## Deliberately not modeled
Category table (fixed enum) · status-history table (comms log covers demo;
named production deferral) · gender (no rule/screen uses it) ·
products.is_active (dead flag without admin UI) · payments.provider (constant
column; seam lives in code) · soft deletes.

## Prisma implementation notes
- Partial unique indexes + CHECK constraints + sequence are **raw SQL in the
  migration** (Prisma can't model them). We use `prisma migrate deploy` only;
  no drift issues.
- Composite FK is native Prisma (multi-field relation).
- `applications.agent_id` has no separate FK to agents — the composite FK
  guarantees it transitively through customers.
