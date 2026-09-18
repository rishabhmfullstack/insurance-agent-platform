import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

// Email failure must NEVER affect payment/policy truth. The send layer is
// mocked to hard-fail; everything else (DB, domain, workflow) is real.
vi.mock("@/lib/integrations/email/resend", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/integrations/email/resend")>();
  return {
    ...original,
    sendEmail: vi.fn(async () => ({
      sent: false as const,
      logged: false as const,
      error: "simulated provider outage",
    })),
  };
});

import {
  agreeByToken,
  attachPdf,
  createDraftQuote,
} from "@/lib/domain/applications";
import { activateFromVerifiedPayment } from "@/lib/domain/activation";
import { findOpenPayment } from "@/lib/domain/payments";
import { generatePaymentLink, sendPolicyConfirmation } from "./payment-flow";

const prisma = new PrismaClient();
const AGENT_ID = "00000000-0000-4000-8000-0000000a0003";
const PRODUCT_ID = "00000000-0000-4000-8000-00000000f103";

async function cleanup() {
  await prisma.communication.deleteMany({ where: { application: { agentId: AGENT_ID } } });
  await prisma.policy.deleteMany({ where: { application: { agentId: AGENT_ID } } });
  await prisma.payment.deleteMany({ where: { application: { agentId: AGENT_ID } } });
  await prisma.application.deleteMany({ where: { agentId: AGENT_ID } });
  await prisma.customer.deleteMany({ where: { agentId: AGENT_ID } });
  await prisma.product.deleteMany({ where: { id: PRODUCT_ID } });
  await prisma.agent.deleteMany({ where: { id: AGENT_ID } });
}

beforeAll(async () => {
  await cleanup();
  await prisma.agent.create({
    data: { id: AGENT_ID, name: "Mail Agent", email: "mail-agent@example.com", passwordHash: "x" },
  });
  await prisma.product.create({
    data: {
      id: PRODUCT_ID,
      category: "HEALTH",
      name: "Mail Health Product",
      description: "email failure test product",
      coverageAmount: 500000n * 100n,
      basePremium: 6000n * 100n,
      eligibilityRules: { minAge: 18, maxAge: 65 },
      premiumFactors: {},
    },
  });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("email failure after activation", () => {
  it("policy stays ACTIVE; comm row FAILED with the error; resend possible", async () => {
    const customer = await prisma.customer.create({
      data: {
        agentId: AGENT_ID,
        name: "Mail Customer",
        phone: "+913333300001",
        email: "mail-c@example.com",
        dob: new Date("1998-04-15"),
        annualIncome: 800000n * 100n,
        city: "Testville",
        isSmoker: false,
        ownsVehicle: false,
      },
    });
    const draft = await createDraftQuote(AGENT_ID, customer.id, PRODUCT_ID);
    if (!draft.ok) throw new Error("draft failed");
    await attachPdf(draft.applicationId, "http://example.com/q.pdf");
    const app = await prisma.application.findUniqueOrThrow({ where: { id: draft.applicationId } });
    await agreeByToken(app.reviewToken);
    await generatePaymentLink(app.id);
    const payment = await findOpenPayment(app.id);

    const activation = await activateFromVerifiedPayment({
      providerLinkId: payment!.providerLinkId,
      providerPaymentId: "pay_mailfail_1",
      amount: payment!.amount,
      currency: "INR",
      rawPayload: { test: true },
    });
    expect(activation.outcome).toBe("activated");

    // Email dispatch fails hard — activation truth must be untouched.
    const emailResult = await sendPolicyConfirmation(app.id);
    expect(emailResult).toEqual({ ok: false, commStatus: "FAILED" });

    const after = await prisma.application.findUniqueOrThrow({
      where: { id: app.id },
      include: { policy: true, payments: true, communications: true },
    });
    expect(after.status).toBe("ACTIVE"); // untouched
    expect(after.policy).not.toBeNull(); // untouched
    expect(after.payments[0].status).toBe("PAID"); // untouched

    const comm = after.communications.find((c) => c.templateKey === "policy_confirmation");
    expect(comm?.status).toBe("FAILED");
    expect(comm?.error).toContain("simulated provider outage");

    // Resend uses the same helper — here still failing, but each attempt is
    // recorded; the UI surfaces the FAILED status with a resend button.
    await sendPolicyConfirmation(app.id);
    const attempts = await prisma.communication.count({
      where: { applicationId: app.id, templateKey: "policy_confirmation" },
    });
    expect(attempts).toBe(2);
  });
});
