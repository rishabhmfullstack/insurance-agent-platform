import { Prisma, type Payment } from "@prisma/client";
import { prisma } from "@/lib/db";

// Payment-side transitions (DB only; the provider lives in integrations and
// is orchestrated by workflows/payment-flow.ts). Payment states never regress:
// CREATED → PAID | FAILED | EXPIRED | CANCELLED, all enforced as conditional
// updates. Application AGREED ⇄ PAYMENT_PENDING pairs with them transactionally.

export async function findOpenPayment(applicationId: string): Promise<Payment | null> {
  return prisma.payment.findFirst({
    where: { applicationId, status: "CREATED" },
  });
}

export type RecordPaymentResult =
  | { ok: true; payment: Payment }
  | { ok: false; reason: "not_agreed" }
  | { ok: false; reason: "open_payment_exists"; existing: Payment };

/** Inserts the CREATED payment (amount copied from the FROZEN premium) and
 * moves AGREED → PAYMENT_PENDING in one transaction. The partial unique index
 * (one open payment per application) is the arbiter under races. */
export async function recordPaymentAndMarkPending(
  applicationId: string,
  providerLinkId: string,
  shortUrl: string,
): Promise<RecordPaymentResult> {
  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!app || app.status !== "AGREED") {
    const existing = await findOpenPayment(applicationId);
    if (existing) return { ok: false, reason: "open_payment_exists", existing };
    return { ok: false, reason: "not_agreed" };
  }

  try {
    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          applicationId,
          providerLinkId,
          shortUrl,
          amount: app.premiumAmount, // single source of truth (D-10)
          currency: "INR",
          status: "CREATED",
        },
      });
      const moved = await tx.application.updateMany({
        where: { id: applicationId, status: "AGREED" },
        data: { status: "PAYMENT_PENDING" },
      });
      if (moved.count !== 1) {
        throw new Error("application left AGREED during payment creation");
      }
      return created;
    });
    return { ok: true, payment };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await findOpenPayment(applicationId);
      if (existing) return { ok: false, reason: "open_payment_exists", existing };
    }
    throw e;
  }
}

/** Terminal-izes an open payment (EXPIRED/CANCELLED/FAILED) and reverts the
 * application PAYMENT_PENDING → AGREED — the one backward edge in the state
 * machine. Idempotent: returns false if the payment was not CREATED. */
export async function markPaymentTerminalAndRevert(
  paymentId: string,
  terminal: "EXPIRED" | "CANCELLED" | "FAILED",
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const moved = await tx.payment.updateMany({
      where: { id: paymentId, status: "CREATED" },
      data: { status: terminal },
    });
    if (moved.count !== 1) return false; // already terminal (never regress)

    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    await tx.application.updateMany({
      where: { id: payment.applicationId, status: "PAYMENT_PENDING" },
      data: { status: "AGREED" },
    });
    return true;
  });
}
