import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import {
  activateFromVerifiedPayment,
  type ActivationResult,
} from "@/lib/domain/activation";
import {
  findOpenPayment,
  markPaymentTerminalAndRevert,
  recordPaymentAndMarkPending,
} from "@/lib/domain/payments";
import { getPaymentProvider } from "@/lib/integrations/payments/provider";
import {
  buildPolicyConfirmationEmail,
  sendEmail,
} from "@/lib/integrations/email/resend";
import { formatDate, formatPaise } from "@/lib/format";

// Orchestration layer between actions/routes and domain+integrations (D-23):
// the webhook route, the reconcile action and the agent actions all share
// these flows, so there is exactly one implementation of each behavior.
// Rule preserved: domain never imports integrations; this module composes them.

export type GenerateLinkResult =
  | { ok: true; shortUrl: string; reused: boolean }
  | { ok: false; error: string };

/** AGREED → PAYMENT_PENDING with a provider link. Reuses an existing open
 * link (one-open-link is server-enforced, not just button state). If the
 * provider call succeeded but a concurrent request won the DB race, the
 * fresh provider link is cancelled — never two payable links. */
export async function generatePaymentLink(
  applicationId: string,
): Promise<GenerateLinkResult> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { customer: true, product: true },
  });
  if (!app) return { ok: false, error: "Application not found." };

  const existing = await findOpenPayment(applicationId);
  if (existing) return { ok: true, shortUrl: existing.shortUrl, reused: true };

  if (app.status !== "AGREED") {
    return { ok: false, error: "A payment link can only be generated after the customer agrees." };
  }

  const provider = getPaymentProvider();
  let link;
  try {
    link = await provider.createPaymentLink({
      amount: app.premiumAmount, // FROZEN premium — the only amount source
      currency: "INR",
      description: `${app.product.name} — annual premium (demo)`,
      referenceId: app.id,
      customerName: app.customer.name,
      customerPhone: app.customer.phone,
      callbackUrl: `${config.APP_URL}/review/${app.reviewToken}`,
    });
  } catch (e) {
    console.error("payment link creation failed:", e);
    return { ok: false, error: "The payment provider could not create a link. Try again." };
  }

  const recorded = await recordPaymentAndMarkPending(app.id, link.linkId, link.shortUrl);
  if (recorded.ok) return { ok: true, shortUrl: link.shortUrl, reused: false };

  // Lost a race or state moved — the fresh provider link must not stay payable.
  await provider.cancelPaymentLink(link.linkId).catch((e) =>
    console.error("cancel of orphan payment link failed:", e),
  );
  if (recorded.reason === "open_payment_exists") {
    return { ok: true, shortUrl: recorded.existing.shortUrl, reused: true };
  }
  return { ok: false, error: "A payment link can only be generated after the customer agrees." };
}

export type RegenerateResult =
  | { ok: true; shortUrl: string }
  | { ok: false; error: string };

/** Cancel-before-regenerate (pressure-test 2b): the old link is cancelled at
 * the provider FIRST, then terminal-ized locally (reverting the application
 * to AGREED), and only then is a new link created. */
export async function regeneratePaymentLink(
  applicationId: string,
): Promise<RegenerateResult> {
  const open = await findOpenPayment(applicationId);
  if (open) {
    const provider = getPaymentProvider();
    try {
      await provider.cancelPaymentLink(open.providerLinkId);
    } catch (e) {
      // If the provider cancel fails, do NOT proceed — two payable links is
      // the double-payment trap. Fail closed.
      console.error("provider cancel failed:", e);
      return { ok: false, error: "Could not cancel the existing link. Try again." };
    }
    await markPaymentTerminalAndRevert(open.id, "CANCELLED");
  }
  const fresh = await generatePaymentLink(applicationId);
  if (!fresh.ok) return fresh;
  return { ok: true, shortUrl: fresh.shortUrl };
}

export type ReconcileResult =
  | { outcome: "activated"; policyNumber: string }
  | { outcome: "already_active" }
  | { outcome: "still_pending" }
  | { outcome: "reverted"; providerStatus: "expired" | "cancelled" }
  | { outcome: "anomaly"; detail: string }
  | { outcome: "no_open_payment" };

/** The missed-webhook safety net: an agent-initiated OUTBOUND status query
 * that feeds the SAME activation path as the webhook. Nothing inbound is
 * trusted here either. */
export async function reconcilePayment(applicationId: string): Promise<ReconcileResult> {
  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (app?.status === "ACTIVE") return { outcome: "already_active" };

  const open = await findOpenPayment(applicationId);
  if (!open) return { outcome: "no_open_payment" };

  const status = await getPaymentProvider().fetchLinkStatus(open.providerLinkId);

  if (status.status === "created") return { outcome: "still_pending" };

  if (status.status === "expired" || status.status === "cancelled") {
    await markPaymentTerminalAndRevert(
      open.id,
      status.status === "expired" ? "EXPIRED" : "CANCELLED",
    );
    return { outcome: "reverted", providerStatus: status.status };
  }

  // paid → identical verification + activation as the webhook
  const result = await activateFromVerifiedPayment({
    providerLinkId: open.providerLinkId,
    providerPaymentId: status.paymentId,
    amount: status.amount,
    currency: status.currency,
    rawPayload: status.raw,
  });
  return finishActivation(result);
}

/** Shared tail for webhook + reconcile: email on activation, anomaly mapping. */
async function finishActivation(result: ActivationResult): Promise<ReconcileResult> {
  switch (result.outcome) {
    case "activated":
      // Post-commit, non-blocking: email failure never touches payment truth.
      await sendPolicyConfirmation(result.applicationId);
      return { outcome: "activated", policyNumber: result.policyNumber };
    case "already_processed":
      return { outcome: "already_active" };
    case "unknown_link":
      return { outcome: "anomaly", detail: "unknown payment link" };
    case "amount_mismatch":
      return {
        outcome: "anomaly",
        detail: `amount mismatch: expected ${result.expected}, got ${result.got} — NOT activated`,
      };
    case "currency_mismatch":
      return { outcome: "anomaly", detail: `currency mismatch: ${result.got} — NOT activated` };
    case "paid_after_terminal":
      return {
        outcome: "anomaly",
        detail: `payment received on a ${result.paymentStatus} link — manual refund required (see README)`,
      };
  }
}

// ---------------------------------------------------------------------------
// Webhook events (called by the route AFTER signature verification)

type WebhookOutcome = { httpStatus: number; note: string };

export async function processWebhookEvent(event: unknown): Promise<WebhookOutcome> {
  const e = event as {
    event?: string;
    payload?: {
      payment_link?: { entity?: { id?: string } };
      payment?: { entity?: { id?: string; amount?: number; currency?: string } };
    };
  };

  const linkId = e?.payload?.payment_link?.entity?.id;

  if (e?.event === "payment_link.paid") {
    const payment = e.payload?.payment?.entity;
    if (!linkId || !payment?.id || typeof payment.amount !== "number" || !payment.currency) {
      return { httpStatus: 200, note: "malformed paid event ignored" };
    }
    const result = await activateFromVerifiedPayment({
      providerLinkId: linkId,
      providerPaymentId: payment.id,
      amount: BigInt(payment.amount),
      currency: payment.currency,
      rawPayload: event,
    });
    const finished = await finishActivation(result);
    if (finished.outcome === "anomaly") {
      console.error(`WEBHOOK ANOMALY [${linkId}]: ${finished.detail}`);
      return { httpStatus: 200, note: `anomaly logged: ${finished.detail}` };
    }
    return { httpStatus: 200, note: finished.outcome };
  }

  if (e?.event === "payment_link.expired" || e?.event === "payment_link.cancelled") {
    if (!linkId) return { httpStatus: 200, note: "malformed event ignored" };
    const payment = await prisma.payment.findUnique({ where: { providerLinkId: linkId } });
    if (!payment) return { httpStatus: 200, note: "unknown link ignored" };
    const terminal = e.event === "payment_link.expired" ? "EXPIRED" : "CANCELLED";
    const changed = await markPaymentTerminalAndRevert(payment.id, terminal);
    return { httpStatus: 200, note: changed ? `payment ${terminal}, application reverted` : "already terminal" };
  }

  // Unrelated events: acknowledge so the provider stops retrying.
  return { httpStatus: 200, note: `ignored event ${e?.event ?? "unknown"}` };
}

// ---------------------------------------------------------------------------
// Confirmation email (also used by the resend action)

export type EmailDispatchResult = { ok: boolean; commStatus: "SENT" | "LOGGED" | "FAILED" };

export async function sendPolicyConfirmation(
  applicationId: string,
): Promise<EmailDispatchResult> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { customer: true, product: true, policy: true },
  });
  if (!app?.policy) return { ok: false, commStatus: "FAILED" };

  const email = buildPolicyConfirmationEmail({
    customerName: app.customer.name,
    policyNumber: app.policy.policyNumber,
    productName: app.product.name,
    coverageDisplay: formatPaise(app.product.coverageAmount),
    premiumDisplay: formatPaise(app.premiumAmount),
    startDateDisplay: formatDate(app.policy.startDate),
    endDateDisplay: formatDate(app.policy.endDate),
  });

  const result = await sendEmail({
    to: app.customer.email,
    subject: email.subject,
    text: email.text,
  });

  const commStatus = result.sent ? "SENT" : "logged" in result && result.logged ? "LOGGED" : "FAILED";
  await prisma.communication.create({
    data: {
      applicationId: app.id,
      channel: "EMAIL",
      mode: config.EMAIL_MODE === "live" ? "LIVE" : "LOG",
      templateKey: "policy_confirmation",
      recipient: app.customer.email,
      renderedContent: `Subject: ${email.subject}\n\n${email.text}`,
      status: commStatus,
      error: result.sent || ("logged" in result && result.logged) ? null : result.error,
    },
  });
  return { ok: commStatus !== "FAILED", commStatus };
}
