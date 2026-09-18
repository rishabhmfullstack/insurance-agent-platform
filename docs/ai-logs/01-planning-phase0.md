# AI Log 01 — Phase 0: Discovery, Planning, Pressure Tests

Date: 2026-09-18 · Tool: Claude Code (Claude Fable 5) · No code written in this phase.

Log format used throughout this project:
**Objective → Context → Prompting approach → AI recommendation → My evaluation →
Decision → Validation.** Logs are written per work session, committed alongside
the work they describe. Nothing here is reconstructed after the fact.

---

## Session 1 — Requirement analysis & full plan

**Objective:** Turn the assignment brief into requirements, scope, architecture
options, stack, DB entities, integration strategies, roadmap.

**Prompting approach:** Gave the AI the full assignment + interview context and
an explicit role: *senior engineer who challenges my assumptions, not a code
generator*. Demanded explicit/inferred/decision labeling on every requirement,
and forced 2–3 architecture options before any recommendation.

**AI recommendation (highlights):** Next.js monolith on Vercel; Razorpay test
mode; WhatsApp as honest wa.me demo mode behind a provider interface (flagged
Meta Cloud API verification lead time as the top external risk); tokenized
customer review page to close the agree loop without customer accounts;
webhook-as-source-of-truth payment design; rules-as-data eligibility.

**My evaluation:** Accepted the overall shape. Key things I probed: whether a
separate backend would demo better (no — two deploys, duplicated types, no
value for solo MVP); whether WhatsApp Cloud API was feasible in the timeline
(no — verification + template approval risk); whether customer login was
needed (no — capability links).

**Decision:** Plan approved with all recommendations; deadline-driven cut list
agreed (Playwright → Cloud API → stats, in that order).

## Session 2 — Screen map

**Objective:** Screen-by-screen product flow.

**AI recommendation:** 8 built screens + Razorpay hosted page. Two
minimizations: dashboard doubles as customer list (no /customers index); one
state-driven /review/[token] page instead of separate agreed/paid pages. No
product selection from the catalogue (no eligibility context there).

**My evaluation & decision:** Accepted as-is; the "catalogue has no select
button" reasoning (a product without a customer has no premium/eligibility)
held up.

## Session 3 — Workflow & state-machine pressure test

**Objective:** Validate the business workflow before schema design.

**AI recommendation — including corrections of its OWN earlier proposal:**
- **Cut SENT status** (sharing is a logged event; the status gated nothing).
- **Cut DECLINED** (unreachable — no screen offers it).
- Expiry lazy, no cron; age/band boundaries pinned (bands fixed to 46–59/60+
  after spotting its own overlap at 60).
- One backward edge: PAYMENT_PENDING → AGREED on payment failure, with
  cancel-old-link-first to close the double-payment trap.
- Reconcile button reusing the exact webhook activation path as a
  missed-webhook safety net.

**My evaluation:** This session is why the pressure-test step existed — the
first-draft state machine (my accepted plan!) had two dead statuses and an
ambiguous expiry story. Accepted all corrections.

**Decision:** 5-status machine + payment sub-states finalized (see DATABASE.md).

## Session 4 — Architecture

**Objective:** App architecture, module structure, trust zones, logic placement.

**AI recommendation:** Server-first (no REST for our own pages; 2 route
handlers total); `app → actions → domain → integrations` dependency rule;
three trust zones (session / capability token / HMAC); activation logic shared
by webhook + reconcile; "actions longer than ~15 lines = logic leaking" as a
review heuristic.

**Decision:** Accepted. Recorded as D-01/D-02 + ARCHITECTURE.md.

## Session 5 — Database design + schema pressure test

**Objective:** Full schema, then adversarial review of it.

**AI recommendation (design):** 7 tables; BIGINT paise everywhere (correcting
the earlier two-unit rupees/paise convention); partial unique indexes for
one-open-application and one-open-payment; policy number from a DB sequence;
raw_webhook_payload for audit.

**Pressure test findings (the valuable part):**
1. **EXPIRED was stored but unreachable** in the transition table — and naive
   lazy write-back could have killed live AGREED deals. Fixed: expiry only
   from DRAFT/QUOTE_GENERATED.
2. **Denormalized applications.agent_id could silently diverge** → composite
   FK (customer_id, agent_id) → customers(id, agent_id). Code promise turned
   into a DB guarantee.
3. Three CHECK constraints added (pdf-when-not-draft, consent-before-money,
   positive money).
4. **Three fields cut by our own "earns its place" rule:** gender,
   products.is_active, payments.provider.
5. Implementation contracts recorded (rows-affected-first activation,
   two-fetcher repository shape, unique-violation → friendly error).

**My evaluation:** All five accepted. The gender cut and the composite FK were
things I would not have caught alone; the EXPIRED reachability gap was a real
bug prevented before a line of code existed.

**Decision:** Schema frozen (DATABASE.md); Phase 1 approved.

---

## Net effect of Phase 0

Three design bugs found and fixed **before implementation**: dead statuses,
EXPIRED reachability/live-deal risk, divergence-prone denormalization. Scope
cut list agreed in advance. Every decision traceable in DECISIONS.md.
