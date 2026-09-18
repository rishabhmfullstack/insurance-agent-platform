import { randomBytes } from "crypto";
import { Prisma, type Application } from "@prisma/client";
import { prisma } from "@/lib/db";
import { evaluateEligibility } from "./eligibility";
import { computePremium } from "./premium";
import { eligibilityRulesSchema, premiumFactorsSchema } from "./rules";

// THE state-machine chokepoint (docs/DATABASE.md): the only module that
// changes application status. Every transition is a conditional update
// (`WHERE id = ? AND status = expected`) so illegal transitions are impossible
// regardless of caller, and races resolve to exactly one winner.
//
// Transition table implemented here:
//   —                → DRAFT            createDraftQuote (eligible, no open app)
//   DRAFT            → QUOTE_GENERATED  attachPdf (PDF stored)
//   QUOTE_GENERATED  → AGREED           agreeByToken (within validity)
//   DRAFT/QUOTE_GEN. → EXPIRED          lazy write-back (validUntil passed)
// Payment transitions (AGREED ⇄ PAYMENT_PENDING → ACTIVE) arrive in Phase 4.

export const QUOTE_VALIDITY_DAYS = 30;

function newReviewToken(): string {
  return randomBytes(16).toString("base64url"); // 128-bit capability (D: tokens)
}

export type CreateDraftResult =
  | { ok: true; applicationId: string }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "ineligible"; details: string[] }
  | { ok: false; reason: "duplicate"; existingApplicationId: string | null };

/** Creates the DRAFT application with the premium computed and FROZEN.
 * Server-side eligibility re-check — never trusts the UI. The lazy-expiry
 * write-back and the insert share one transaction (pressure-test 1d). */
export async function createDraftQuote(
  agentId: string,
  customerId: string,
  productId: string,
  now: Date = new Date(),
): Promise<CreateDraftResult> {
  const [customer, product] = await Promise.all([
    prisma.customer.findFirst({ where: { id: customerId, agentId } }),
    prisma.product.findUnique({ where: { id: productId } }),
  ]);
  if (!customer || !product) return { ok: false, reason: "not_found" };

  const rules = eligibilityRulesSchema.parse(product.eligibilityRules);
  const verdict = evaluateEligibility(customer, rules, now);
  if (!verdict.eligible) {
    return { ok: false, reason: "ineligible", details: verdict.reasons };
  }

  const premium = computePremium(
    customer,
    product.basePremium,
    premiumFactorsSchema.parse(product.premiumFactors),
    now,
  );
  const validUntil = new Date(now.getTime() + QUOTE_VALIDITY_DAYS * 24 * 60 * 60 * 1000);

  try {
    const app = await prisma.$transaction(async (tx) => {
      // Lazy EXPIRED write-back (D-12) frees the partial-unique slot before
      // the insert; only DRAFT/QUOTE_GENERATED are ever expirable.
      await tx.application.updateMany({
        where: {
          customerId,
          productId,
          status: { in: ["DRAFT", "QUOTE_GENERATED"] },
          validUntil: { lt: now },
        },
        data: { status: "EXPIRED" },
      });
      return tx.application.create({
        data: {
          agentId,
          customerId,
          productId,
          status: "DRAFT",
          premiumAmount: premium,
          validUntil,
          reviewToken: newReviewToken(),
        },
      });
    });
    return { ok: true, applicationId: app.id };
  } catch (e) {
    // The partial unique index is the arbiter of "one open application per
    // customer+product" — a violation means a live quote already exists.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.application.findFirst({
        where: { customerId, productId, status: { not: "EXPIRED" } },
        select: { id: true },
      });
      return {
        ok: false,
        reason: "duplicate",
        existingApplicationId: existing?.id ?? null,
      };
    }
    throw e;
  }
}

/** DRAFT → QUOTE_GENERATED once the PDF is stored. Returns false if the
 * application was not in DRAFT (already generated, or expired). */
export async function attachPdf(applicationId: string, pdfUrl: string): Promise<boolean> {
  const r = await prisma.application.updateMany({
    where: { id: applicationId, status: "DRAFT" },
    data: { status: "QUOTE_GENERATED", pdfUrl },
  });
  return r.count === 1;
}

export type AgreeResult =
  | "agreed"
  | "already_agreed"
  | "expired"
  | "not_ready"
  | "invalid";

/** The single privilege the review token grants beyond viewing:
 * QUOTE_GENERATED → AGREED, within validity, idempotent. */
export async function agreeByToken(token: string, now: Date = new Date()): Promise<AgreeResult> {
  const app = await prisma.application.findUnique({ where: { reviewToken: token } });
  if (!app) return "invalid";

  switch (app.status) {
    case "AGREED":
    case "PAYMENT_PENDING":
    case "ACTIVE":
      return "already_agreed";
    case "DRAFT":
      return "not_ready";
    case "EXPIRED":
      return "expired";
  }

  // status === QUOTE_GENERATED — validity gates acceptance (fail-closed:
  // checked directly even before any write-back has happened).
  if (app.validUntil < now) {
    await expireIfStale(app.id, now);
    return "expired";
  }

  const r = await prisma.application.updateMany({
    where: { id: app.id, status: "QUOTE_GENERATED", validUntil: { gte: now } },
    data: { status: "AGREED", agreedAt: now },
  });
  // Zero rows on a lost race means someone else's agree landed first — same
  // user double-clicking. Idempotent from the customer's point of view.
  return r.count === 1 ? "agreed" : "already_agreed";
}

/** Lazy EXPIRED write-back for read paths (review page, application page).
 * Only DRAFT/QUOTE_GENERATED are expirable — never AGREED/PAYMENT_PENDING. */
export async function expireIfStale(applicationId: string, now: Date = new Date()): Promise<boolean> {
  const r = await prisma.application.updateMany({
    where: {
      id: applicationId,
      status: { in: ["DRAFT", "QUOTE_GENERATED"] },
      validUntil: { lt: now },
    },
    data: { status: "EXPIRED" },
  });
  return r.count === 1;
}

/** Derived check for rendering (write-back may not have run yet). */
export function isQuoteExpired(
  app: Pick<Application, "status" | "validUntil">,
  now: Date = new Date(),
): boolean {
  if (app.status === "EXPIRED") return true;
  return (
    (app.status === "DRAFT" || app.status === "QUOTE_GENERATED") &&
    app.validUntil < now
  );
}
