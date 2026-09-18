# AI Log 07 — Phase 5: Vercel Deployment (Neon live, payments still mock)

Date: 2026-09-18 · Tool: Claude Code (Claude Fable 5, driving the Vercel CLI
after owner `vercel login`)

**Live URL: https://insurance-agent-platform-lemon.vercel.app**

## What happened, in order (the honest version)

1. `postinstall: prisma generate` pushed first (cached-install fix) — before
   the import built.
2. Owner's dashboard import attempt collided with the project created by an
   earlier click; switched to CLI: linked the existing project, listed the
   wizard-saved env vars.
3. **Two wizard-mangled env values found by the fail-fast config validation**
   (exactly what it exists for): `APP_URL: Invalid URL`, then
   `AUTH_SECRET must be at least 32 characters`. Both replaced cleanly via
   CLI (AUTH_SECRET regenerated — the pasted one had also appeared in chat).
   Also removed a stray empty `TEST_DATABASE_URL` and added
   `pgbouncer=true` to the pooled Neon URL.
4. Build green → alias returned **503 DEPLOYMENT_PAUSED** → owner resumed
   interactively (CLI refuses non-interactive resume).
5. Blob store created + linked via
   `vercel blob create-store insurance-pdfs --access public --yes`
   (public: unguessable-URL model per D-08) → redeploy so the token applies.
6. **Alias surprise:** `insurance-agent-platform.vercel.app` belongs to
   someone else globally — our real alias is
   `insurance-agent-platform-lemon.vercel.app`. APP_URL corrected + redeploy
   (it feeds review links and payment callbacks).
7. **Security gap closed:** `RAZORPAY_WEBHOOK_SECRET` was unset in prod, so
   the public webhook verified against the dev default visible in the public
   repo. Real random secret set (stored in gitignored var/ file for the
   Razorpay dashboard later); verified the dev-default signature now gets 400.

## Production smoke test (all passed)

- Login with seeded credentials → dashboard lists the 5 demo customers (Neon).
- Products page renders the 7-product catalogue.
- Create Quote for Aarav via real form POST → 303 to the new application;
  page shows Quote ready, ₹8,000, demo-labeled WhatsApp share.
- **PDF served from `*.public.blob.vercel-storage.com` (`%PDF-1.3`)** — blob
  mode confirmed.
- Review page anonymous: content + `Referrer-Policy: no-referrer`; I Agree
  multipart POST → 303 → "You agreed"; agent view shows Customer agreed +
  Generate Payment Link.
- Negative: bad token 404 · foreign application id 404 · logged-out dashboard
  307→/login · webhook bad signature 400 · signup 200.

## State / remaining

- Payments run the **labeled mock provider** on prod until Razorpay test keys
  exist (`RAZORPAY_KEY_ID/SECRET` in Vercel + dashboard webhook with the
  already-set secret + events payment_link.paid/expired/cancelled). Then:
  payment smoke test with test cards + reconcile check.
- Email mode: `log` (Resend optional, per plan §3).
- Left on prod: Aarav's AGREED application — deliberate mid-flow demo state.
- README deployment section (URL, credentials, service-mode matrix) lands in
  the ship phase.
