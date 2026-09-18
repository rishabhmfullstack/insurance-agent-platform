"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAgent } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  agreeByToken,
  attachPdf,
  createDraftQuote,
  expireIfStale,
  isQuoteExpired,
} from "@/lib/domain/applications";
import { getApplicationForAgent } from "@/lib/data/applications";
import { generateAndStoreQuotePdf } from "@/lib/integrations/pdf";
import {
  buildQuoteShareMessage,
  reviewUrlFor,
  waMeUrl,
} from "@/lib/integrations/messaging/whatsapp";
import { config } from "@/lib/config";
import { formatDate, formatPaise } from "@/lib/format";

const idSchema = z.uuid();

/** Generates + stores the PDF and moves DRAFT → QUOTE_GENERATED.
 * Failure leaves the application in DRAFT with a retry button — never throws. */
async function tryGeneratePdf(applicationId: string): Promise<void> {
  try {
    const app = await prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
      include: { customer: true, product: true },
    });
    const url = await generateAndStoreQuotePdf(app, app.customer, app.product);
    await attachPdf(applicationId, url);
  } catch (e) {
    console.error(`PDF generation failed for application ${applicationId}:`, e);
  }
}

export async function createQuoteAction(formData: FormData): Promise<void> {
  const { agentId } = await requireAgent();
  const customerId = idSchema.parse(formData.get("customerId"));
  const productId = idSchema.parse(formData.get("productId"));

  const draft = await createDraftQuote(agentId, customerId, productId);

  if (!draft.ok) {
    if (draft.reason === "duplicate" && draft.existingApplicationId) {
      // Friendly arbitration of the partial-unique index: go to the live quote.
      redirect(`/applications/${draft.existingApplicationId}`);
    }
    redirect(`/customers/${customerId}?quoteError=${draft.reason}`);
  }

  await tryGeneratePdf(draft.applicationId);
  revalidatePath(`/customers/${customerId}`);
  redirect(`/applications/${draft.applicationId}`);
}

export async function retryPdfAction(formData: FormData): Promise<void> {
  const { agentId } = await requireAgent();
  const applicationId = idSchema.parse(formData.get("applicationId"));
  const app = await getApplicationForAgent(applicationId, agentId); // scope check
  if (app.status === "DRAFT") {
    await tryGeneratePdf(applicationId);
  }
  revalidatePath(`/applications/${applicationId}`);
  redirect(`/applications/${applicationId}`);
}

export type ShareResult =
  | { ok: true; waUrl: string }
  | { ok: false; error: string };

/** Shares the quote via WhatsApp demo mode: logs the rendered message to
 * communications (a logged EVENT, not a status transition — D-11), then the
 * client opens the wa.me URL. */
export async function shareQuoteAction(applicationId: string): Promise<ShareResult> {
  const { agentId } = await requireAgent();
  const parsed = idSchema.safeParse(applicationId);
  if (!parsed.success) return { ok: false, error: "Invalid application." };

  const app = await getApplicationForAgent(parsed.data, agentId);

  if (isQuoteExpired(app)) {
    await expireIfStale(app.id);
    revalidatePath(`/applications/${app.id}`);
    return { ok: false, error: "This quote has expired. Create a new quote from the customer profile." };
  }
  if (app.status !== "QUOTE_GENERATED") {
    return { ok: false, error: "The quote PDF must be generated before sharing." };
  }

  const message = buildQuoteShareMessage({
    customerName: app.customer.name,
    productName: app.product.name,
    premiumDisplay: formatPaise(app.premiumAmount),
    validUntilDisplay: formatDate(app.validUntil),
    reviewUrl: reviewUrlFor(app.reviewToken),
  });

  await prisma.communication.create({
    data: {
      applicationId: app.id,
      channel: "WHATSAPP",
      mode: config.WHATSAPP_MODE === "demo" ? "DEMO" : "LIVE",
      templateKey: "quote_share",
      recipient: app.customer.phone,
      renderedContent: message,
      status: "LOGGED",
    },
  });

  revalidatePath(`/applications/${app.id}`);
  return { ok: true, waUrl: waMeUrl(app.customer.phone, message) };
}

/** PUBLIC action — the review token is the only credential (Zone 2). Grants
 * exactly one transition; every other outcome just re-renders current state. */
export async function agreeAction(token: string): Promise<void> {
  if (typeof token !== "string" || token.length < 16 || token.length > 64) return;
  await agreeByToken(token);
  revalidatePath(`/review/${token}`);
  redirect(`/review/${token}`);
}
