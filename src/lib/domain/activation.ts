import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// THE activation path (D-05): called by BOTH the webhook route and the
// reconcile action — one code path, so the safety net can never drift from
// the primary. "What counts as a valid payment" is a business rule and lives
// here, not in vendor code.
//
// Concurrency contract (schema pressure-test 2a): the FIRST statement in the
// transaction is the rows-affected-checked payment update — under concurrent
// webhook + reconcile exactly one caller proceeds to create the policy.
// Backstops if this discipline ever slips: UNIQUE provider_payment_id and
// UNIQUE policies.application_id.

export type VerifiedPaymentEvent = {
  providerLinkId: string;
  providerPaymentId: string;
  /** paise, as reported by the provider event */
  amount: bigint;
  currency: string;
  /** the exact provider payload that justified activation — audit trail */
  rawPayload: unknown;
};

export type ActivationResult =
  | { outcome: "activated"; policyNumber: string; applicationId: string }
  | { outcome: "already_processed" }
  | { outcome: "unknown_link" }
  | { outcome: "amount_mismatch"; expected: bigint; got: bigint }
  | { outcome: "currency_mismatch"; got: string }
  | { outcome: "paid_after_terminal"; paymentStatus: string };

export async function activateFromVerifiedPayment(
  event: VerifiedPaymentEvent,
  now: Date = new Date(),
): Promise<ActivationResult> {
  const payment = await prisma.payment.findUnique({
    where: { providerLinkId: event.providerLinkId },
    include: { application: true },
  });
  if (!payment) return { outcome: "unknown_link" };
  if (payment.status === "PAID") return { outcome: "already_processed" };
  if (payment.status !== "CREATED") {
    // Money moved on a link we had already terminal-ized (cancel/pay race,
    // pressure-test 2b). NO activation — logged upstream for manual refund.
    return { outcome: "paid_after_terminal", paymentStatus: payment.status };
  }

  // Fail-closed verification against the FROZEN premium — both the payment
  // row's copy and the application's original must match the event.
  if (event.currency !== payment.currency) {
    return { outcome: "currency_mismatch", got: event.currency };
  }
  if (
    event.amount !== payment.amount ||
    payment.amount !== payment.application.premiumAmount
  ) {
    return {
      outcome: "amount_mismatch",
      expected: payment.application.premiumAmount,
      got: event.amount,
    };
  }

  try {
    const policyNumber = await prisma.$transaction(async (tx) => {
      // (1) FIRST: claim the payment — zero rows means a concurrent caller won.
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: "CREATED" },
        data: {
          status: "PAID",
          providerPaymentId: event.providerPaymentId,
          rawWebhookPayload: event.rawPayload as Prisma.InputJsonValue,
        },
      });
      if (claimed.count !== 1) return null;

      // (2) Policy number from the DB sequence — concurrency-safe, no max+1.
      const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('policy_number_seq') AS n`;
      const number = `POL-${now.getFullYear()}-${String(n).padStart(6, "0")}`;

      // (3) One policy per application — UNIQUE(application_id) is the backstop.
      const end = new Date(now);
      end.setFullYear(end.getFullYear() + 1);
      await tx.policy.create({
        data: {
          applicationId: payment.applicationId,
          policyNumber: number,
          startDate: now,
          endDate: end,
        },
      });

      // (4) PAYMENT_PENDING → ACTIVE; anything else rolls the whole txn back.
      const moved = await tx.application.updateMany({
        where: { id: payment.applicationId, status: "PAYMENT_PENDING" },
        data: { status: "ACTIVE" },
      });
      if (moved.count !== 1) {
        throw new Error(
          `application ${payment.applicationId} was not PAYMENT_PENDING at activation`,
        );
      }
      return number;
    });

    if (policyNumber === null) return { outcome: "already_processed" };
    return {
      outcome: "activated",
      policyNumber,
      applicationId: payment.applicationId,
    };
  } catch (e) {
    // Unique-violation on the policy row = a concurrent activation finished
    // first between our read and write — idempotent from the caller's view.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { outcome: "already_processed" };
    }
    throw e;
  }
}
