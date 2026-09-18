# Decision Log (ADR-lite)

One paragraph per decision: context → options → choice → why. Newest at the bottom.
AI involvement per decision is logged in `ai-logs/`.

**D-01 · Architecture: Next.js monolith on Vercel.** Considered monolith vs
separate backend vs "serverless". Chose the monolith deployed as serverless
functions: one repo/deploy, shared types, webhook = route handler. Module
boundaries (`lib/domain`, `lib/integrations`) are the extraction seams; the
monolith is a deployment choice, not a coupling choice.

**D-02 · No REST layer for our own pages.** Server Components read, Server
Actions mutate; hand-written HTTP surface is exactly two route handlers
(webhook, Auth.js). Smaller attack surface, no duplicated validation.

**D-03 · Roles: Agent only.** Customer = capability-token links (no account);
admin = seed script. Every admin job happens once at seed time; customer auth
would double the surface for zero assignment value.

**D-04 · Payment provider: Razorpay test mode.** Payment Links are a
first-class primitive matching the assignment flow; India-realistic; reviewer
pays with documented test cards. Stripe was the runner-up; either works — the
provider seam is `integrations/payments`.

**D-05 · Webhook is the source of truth for payment.** Client redirects are
attacker-controllable and unreliable. Signature-verified webhook + amount +
currency check activates the policy inside one transaction; the redirect page
only reads state. Reconcile button ("Verify payment status") reuses the same
activation path as a safety net.

**D-06 · WhatsApp: demo click-to-chat mode, honestly labeled.** Meta Cloud API
needs business verification + template approval (days of lead time, external
failure risk). `WHATSAPP_MODE=demo` renders the real message, logs it to
communications, and opens wa.me. Cloud API sits behind the same interface as a
stretch goal. No fake "sent via API" claims anywhere.

**D-07 · Email: Resend with live|log modes.** Free-tier recipient restrictions
must not silently break the flow; `log` mode renders the email into the
communications log so the reviewer always sees it.

**D-08 · PDF: @react-pdf/renderer, generated once, stored in Vercel Blob.**
Headless-browser PDF is painful in serverless. Quote data is frozen, so the
PDF never goes stale; regenerate only exists as the DRAFT retry path.

**D-09 · Eligibility/premium: deterministic rules-as-data.** Per-product JSONB
config evaluated by one pure function; premium = base × ageBand × factors,
rounded once, annual, one-time payment, 1-year term. Explicitly labeled demo
rules, not underwriting.

**D-10 · Premium frozen at quote creation.** PDF, review page, payment link,
and webhook check all read one stored number; they cannot disagree by
construction. Eligibility likewise evaluated once at creation (quote =
snapshot; customers immutable in MVP).

**D-11 · State machine trimmed (planning pressure test).** Cut SENT (sharing
is a logged event, not a state — it gated nothing) and DECLINED (unreachable:
no screen offers it). DRAFT retained only as the PDF-failure state.

**D-12 · EXPIRED: stored but lazily written (schema pressure test).** Pure
derived expiry broke the duplicate-open-application partial unique index
(non-immutable predicate). Resolution: write back EXPIRED when discovered on
read paths; no cron. Only DRAFT/QUOTE_GENERATED can expire — validity gates
acceptance, not payment. The agree guard still checks valid_until directly
(fail-closed before write-back).

**D-13 · All money in BIGINT paise.** A rupees+paise dual convention is an
off-by-100 factory. Integer math end-to-end; matches Razorpay's unit, so the
webhook amount check is a direct equality.

**D-14 · Composite FK for tenant consistency (schema pressure test).**
`applications(customer_id, agent_id) → customers(id, agent_id)` (backed by
UNIQUE(id, agent_id) on customers) makes the denormalized agent_id unable to
diverge — cross-tenant leakage prevented by the database, not by code review.

**D-15 · Cut fields that don't earn their place.** gender (no rule or screen
uses it; gender pricing is a can of worms for a demo), products.is_active
(dead flag without an admin UI), payments.provider (constant column — the
seam lives in code).

**D-16 · Prisma pinned to v6 (Phase 1).** npm resolved Prisma 7, a fresh major
that changed the client architecture (new generator, required driver adapters,
config relocation). For a timed assignment, v6's battle-tested path (classic
client, .env autoload, package.json seed hook) removes a class of unknowns.
Upgrade is a post-submission concern.

**D-17 · Next.js 16 accepted (Phase 1).** create-next-app scaffolded 16.3.5
(current stable) rather than the 15.x assumed in planning. Accepted: it's the
supported stable line; APIs we rely on (App Router, Server Actions, route
handlers, async request APIs) are unchanged for our usage.

**D-18 · Route protection via server-side guards, not middleware (Phase 1).**
The (agent) layout + `requireAgent()` in every page/action enforce auth
server-side where the data lives. Edge middleware would add an edge-safe
config split for what is only a UX redirect; planning already established
middleware is "not the security boundary". Fewer moving parts, same
enforcement.

**D-19 · bcryptjs over bcrypt.** Pure-JS implementation: no native build on
Windows dev or Vercel deploy; cost factor 10 (OWASP-acceptable for MVP) and
the hash format is compatible if swapped later.

**D-20 · Local dev DB: embedded real PostgreSQL 18 (Phase 2).** The dev
machine has no Docker or Postgres, and Neon provisioning needs the owner's
account (browser OAuth). Rather than defer all DB verification to deploy day,
development runs against real Postgres binaries via the `embedded-postgres`
npm package (port 5433, outside the repo). Everything DB-level — migration,
partial uniques, CHECKs, composite FK, sequence — is verified by
`scripts/verify-schema.ts` (38 checks) and re-runs identically against Neon at
deploy. Gotcha found and fixed: Windows initdb defaults to WIN1252, which
cannot store "₹" — the database must be created with `ENCODING 'UTF8'`
(Neon is UTF8 by default, so this is local-only).

**D-21 · Auth.js `trustHost: true` (Phase 2).** Production builds outside
Vercel fail with UntrustedHost (Vercel sets AUTH_TRUST_HOST automatically).
Declared in code so local prod builds behave like the deployment; safe because
the app only ever runs behind hosts we control. Found by the Phase 2 HTTP flow
test — the Phase 1 smoke test never exercised the auth API routes.

**D-22 · tsconfig target ES2020 (Phase 2).** The scaffold's ES2017 target
rejects BigInt literals, which the paise convention (D-13) uses throughout.
ES2020 is safely below every runtime we target (Node 20, evergreen browsers).

**D-23 · Workflow orchestration layer (Phase 4).** The webhook route, the
reconcile action and the agent payment actions all need the same flows
(generate/regenerate link, process event, activate, email). Domain must not
import integrations, and duplicating orchestration across callers is how the
safety net drifts from the primary path. `lib/workflows/` composes domain +
integrations; actions and routes stay thin. Dependency rule becomes
`app → actions/routes → workflows → domain | integrations`.

**D-24 · payments.short_url column (Phase 4).** The payable URL is
provider-issued and not derivable from the link id, and both the review page
and the WhatsApp message need it — second migration adds it. Found the moment
the review page was wired; the kind of gap a schema pressure test can't catch
before the consuming UI exists.

**D-25 · Mock payment provider when keys are absent (Phase 4).** Same derived-
mode pattern as PDF storage: no Razorpay keys → an in-memory mock behind the
identical provider interface, with test helpers to simulate provider-side
paid/expired. It exists so the full flow runs locally and in CI without an
account; its URLs are deliberately inert (`mock-payments.invalid`) and the
deployed app always runs real test-mode keys. Never presented as a real
payment; the README service matrix states the active mode.

**D-26 · Tests refuse non-local databases (post-Phase-4 fix).** Once .env's
DATABASE_URL switched to Neon for deployment prep, `npm test` ran the
integration suites against the remote database: 18 failures from network
latency blowing the 5s default timeout, plus cascade failures from aborted
setup — and, worse in principle, test data written to the deployment DB
(cleanups did run; Neon was verified clean afterwards). Fix:
`TEST_DATABASE_URL` override + a fail-closed guard in vitest.setup.ts that
aborts any test run against a non-local URL (explicit `ALLOW_REMOTE_TEST_DB=1`
escape hatch), 30s integration timeouts, and a committed local-DB runner
(`npm run db:local` — embedded real PostgreSQL, UTF8 database creation baked
in). The suite's correctness was never in question — the same 65 tests pass in
~2s locally — but "tests can accidentally target production" was a real
design gap.
