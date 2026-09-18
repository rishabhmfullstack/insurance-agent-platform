"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAgent } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getApplicationForAgent } from "@/lib/data/applications";
import { findOpenPayment } from "@/lib/domain/payments";
import {
  generatePaymentLink,
  reconcilePayment,
  regeneratePaymentLink,
  sendPolicyConfirmation,
} from "@/lib/workflows/payment-flow";
import {
  buildPaymentShareMessage,
  waMeUrl,
} from "@/lib/integrations/messaging/whatsapp";
import { config } from "@/lib/config";
import { formatPaise } from "@/lib/format";

const idSchema = z.uuid();

export type PaymentActionResult = { ok: boolean; message: string };

export async function generatePaymentLinkAction(
  applicationId: string,
): Promise<PaymentActionResult> {
  const { agentId } = await requireAgent();
  const parsed = idSchema.safeParse(applicationId);
  if (!parsed.success) return { ok: false, message: "Invalid application." };
  await getApplicationForAgent(parsed.data, agentId); // ownership gate

  const result = await generatePaymentLink(parsed.data);
  revalidatePath(`/applications/${parsed.data}`);
  return result.ok
    ? { ok: true, message: result.reused ? "Reusing the existing open payment link." : "Payment link created." }
    : { ok: false, message: result.error };
}

export async function sharePaymentLinkAction(
  applicationId: string,
): Promise<{ ok: true; waUrl: string } | { ok: false; message: string }> {
  const { agentId } = await requireAgent();
  const parsed = idSchema.safeParse(applicationId);
  if (!parsed.success) return { ok: false, message: "Invalid application." };
  const app = await getApplicationForAgent(parsed.data, agentId);

  const open = await findOpenPayment(app.id);
  if (app.status !== "PAYMENT_PENDING" || !open) {
    return { ok: false, message: "There is no open payment link to share." };
  }

  const message = buildPaymentShareMessage({
    customerName: app.customer.name,
    productName: app.product.name,
    premiumDisplay: formatPaise(app.premiumAmount),
    paymentUrl: open.shortUrl,
  });

  await prisma.communication.create({
    data: {
      applicationId: app.id,
      channel: "WHATSAPP",
      mode: config.WHATSAPP_MODE === "demo" ? "DEMO" : "LIVE",
      templateKey: "payment_share",
      recipient: app.customer.phone,
      renderedContent: message,
      status: "LOGGED",
    },
  });

  revalidatePath(`/applications/${app.id}`);
  return { ok: true, waUrl: waMeUrl(app.customer.phone, message) };
}

export async function verifyPaymentAction(
  applicationId: string,
): Promise<PaymentActionResult> {
  const { agentId } = await requireAgent();
  const parsed = idSchema.safeParse(applicationId);
  if (!parsed.success) return { ok: false, message: "Invalid application." };
  await getApplicationForAgent(parsed.data, agentId);

  const result = await reconcilePayment(parsed.data);
  revalidatePath(`/applications/${parsed.data}`);
  switch (result.outcome) {
    case "activated":
      return { ok: true, message: `Payment verified — policy ${result.policyNumber} is active.` };
    case "already_active":
      return { ok: true, message: "This application is already active." };
    case "still_pending":
      return { ok: true, message: "No payment received yet — the link is still open." };
    case "reverted":
      return { ok: true, message: `The payment link is ${result.providerStatus}. Generate a new one.` };
    case "no_open_payment":
      return { ok: false, message: "There is no open payment to verify." };
    case "anomaly":
      return { ok: false, message: `Attention needed: ${result.detail}` };
  }
}

export async function regeneratePaymentLinkAction(
  applicationId: string,
): Promise<PaymentActionResult> {
  const { agentId } = await requireAgent();
  const parsed = idSchema.safeParse(applicationId);
  if (!parsed.success) return { ok: false, message: "Invalid application." };
  await getApplicationForAgent(parsed.data, agentId);

  const result = await regeneratePaymentLink(parsed.data);
  revalidatePath(`/applications/${parsed.data}`);
  return result.ok
    ? { ok: true, message: "Old link cancelled; a fresh payment link is ready." }
    : { ok: false, message: result.error };
}

export async function resendEmailAction(formData: FormData): Promise<void> {
  const { agentId } = await requireAgent();
  const applicationId = idSchema.parse(formData.get("applicationId"));
  const app = await getApplicationForAgent(applicationId, agentId);
  if (app.status === "ACTIVE") {
    await sendPolicyConfirmation(applicationId);
  }
  revalidatePath(`/applications/${applicationId}`);
  redirect(`/applications/${applicationId}`);
}
