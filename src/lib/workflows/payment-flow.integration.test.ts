import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { POST } from "@/app/api/webhooks/razorpay/route";
import { config } from "@/lib/config";
import {
  agreeByToken,
  attachPdf,
  createDraftQuote,
} from "@/lib/domain/applications";
import { activateFromVerifiedPayment } from "@/lib/domain/activation";
import { findOpenPayment } from "@/lib/domain/payments";
import {
  generatePaymentLink,
  reconcilePayment,
  regeneratePaymentLink,
  sendPolicyConfirmation,
} from "./payment-flow";
import { signWebhookBody } from "@/lib/integrations/payments/signature";
import { mockMarkExpired, mockMarkPaid } from "@/lib/integrations/payments/mock";

// Payment + activation integration tests against the REAL local Postgres and
// the mock provider (paymentMode is "mock" — no Razorpay keys in dev env).
// Webhook tests go through the ACTUAL route handler with real HMAC signatures,
// so raw-body verification, parsing and dispatch are all exercised.

const prisma = new PrismaClient();

const AGENT_ID = "00000000-0000-4000-8000-0000000a0002";
const PRODUCT_ID = "00000000-0000-4000-8000-00000000f102";
const PREMIUM = 15600n * 100n; // 35yo smoker on base ₹8,000 × 1.3 × 1.5

async function cleanup() {
  await prisma.communication.deleteMany({ where: { application: { agentId: AGENT_ID } } });
  await prisma.policy.deleteMany({ where: { application: { agentId: AGENT_ID } } });
  await prisma.payment.deleteMany({ where: { application: { agentId: AGENT_ID } } });
  await prisma.application.deleteMany({ where: { agentId: AGENT_ID } });
  await prisma.customer.deleteMany({ where: { agentId: AGENT_ID } });
  await prisma.product.deleteMany({ where: { id: PRODUCT_ID } });
  await prisma.agent.deleteMany({ where: { id: AGENT_ID } });
}

/** Walks the legitimate transitions to an AGREED application. */
async function makeAgreedApp(n: number): Promise<{ appId: string; token: string }> {
  const c = await prisma.customer.create({
    data: {
      agentId: AGENT_ID,
      name: `Pay Customer ${n}`,
      phone: `+9122222000${String(n).padStart(2, "0")}`,
      email: `pay-c${n}@example.com`,
      dob: new Date("1991-02-10"), // 35
      annualIncome: 1200000n * 100n,
      city: "Testville",
      isSmoker: true,
      ownsVehicle: false,
    },
  });
  const draft = await createDraftQuote(AGENT_ID, c.id, PRODUCT_ID);
  if (!draft.ok) throw new Error("draft failed");
  await attachPdf(draft.applicationId, "http://example.com/q.pdf");
  const app = await prisma.application.findUniqueOrThrow({
    where: { id: draft.applicationId },
  });
  await agreeByToken(app.reviewToken);
  return { appId: app.id, token: app.reviewToken };
}

function paidEventBody(
  linkId: string,
  paymentId: string,
  amount: bigint,
  currency = "INR",
): string {
  return JSON.stringify({
    event: "payment_link.paid",
    payload: {
      payment_link: { entity: { id: linkId, status: "paid" } },
      payment: { entity: { id: paymentId, amount: Number(amount), currency, status: "captured" } },
    },
  });
}

function linkEventBody(event: "payment_link.expired" | "payment_link.cancelled", linkId: string) {
  return JSON.stringify({ event, payload: { payment_link: { entity: { id: linkId } } } });
}

async function postWebhook(body: string, signature?: string): Promise<Response> {
  return POST(
    new Request("http://localhost/api/webhooks/razorpay", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature":
          signature ?? signWebhookBody(body, config.RAZORPAY_WEBHOOK_SECRET),
      },
    }),
  );
}

beforeAll(async () => {
  await cleanup();
  await prisma.agent.create({
    data: { id: AGENT_ID, name: "Pay Agent", email: "pay-agent@example.com", passwordHash: "x" },
  });
  await prisma.product.create({
    data: {
      id: PRODUCT_ID,
      category: "TERM",
      name: "Pay Term Product",
      description: "payment test product",
      coverageAmount: 500000n * 100n,
      basePremium: 8000n * 100n,
      eligibilityRules: { minAge: 18, maxAge: 60 },
      premiumFactors: { smokerFactor: 1.5 },
    },
  });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("payment link creation", () => {
  it("only an AGREED application gets a link; QUOTE_GENERATED is refused", async () => {
    const c = await prisma.customer.create({
      data: {
        agentId: AGENT_ID,
        name: "Not Agreed",
        phone: "+912222299901",
        email: "na@example.com",
        dob: new Date("1991-02-10"),
        annualIncome: 1200000n * 100n,
        city: "Testville",
        isSmoker: false,
        ownsVehicle: false,
      },
    });
    const draft = await createDraftQuote(AGENT_ID, c.id, PRODUCT_ID);
    if (!draft.ok) throw new Error("draft failed");
    await attachPdf(draft.applicationId, "http://example.com/q.pdf");

    const r = await generatePaymentLink(draft.applicationId);
    expect(r.ok).toBe(false);
  });

  it("creates the payment (amount = frozen premium) and moves to PAYMENT_PENDING", async () => {
    const { appId } = await makeAgreedApp(1);
    const r = await generatePaymentLink(appId);
    expect(r.ok).toBe(true);

    const payment = await findOpenPayment(appId);
    expect(payment?.amount).toBe(PREMIUM);
    expect(payment?.currency).toBe("INR");
    const app = await prisma.application.findUniqueOrThrow({ where: { id: appId } });
    expect(app.status).toBe("PAYMENT_PENDING");
  });

  it("a second generate reuses the open link — one open payment, enforced server-side", async () => {
    const app = await prisma.application.findFirstOrThrow({
      where: { agentId: AGENT_ID, status: "PAYMENT_PENDING" },
    });
    const first = await findOpenPayment(app.id);
    const r = await generatePaymentLink(app.id);
    expect(r).toMatchObject({ ok: true, reused: true, shortUrl: first?.shortUrl });
    expect(await prisma.payment.count({ where: { applicationId: app.id } })).toBe(1);
  });
});

describe("webhook: signature", () => {
  it("rejects an invalid signature with 400 and changes nothing", async () => {
    const app = await prisma.application.findFirstOrThrow({
      where: { agentId: AGENT_ID, status: "PAYMENT_PENDING" },
    });
    const payment = await findOpenPayment(app.id);
    const body = paidEventBody(payment!.providerLinkId, "pay_evil", PREMIUM);

    const res = await postWebhook(body, "0".repeat(64));
    expect(res.status).toBe(400);
    expect((await findOpenPayment(app.id))?.status).toBe("CREATED");
    expect(await prisma.policy.count({ where: { applicationId: app.id } })).toBe(0);
  });

  it("rejects a missing signature with 400", async () => {
    const body = paidEventBody("plink_whatever", "pay_x", PREMIUM);
    const res = await POST(
      new Request("http://localhost/api/webhooks/razorpay", { method: "POST", body }),
    );
    expect(res.status).toBe(400);
  });

  it("a tampered body fails verification even with a once-valid signature", async () => {
    const body = paidEventBody("plink_a", "pay_a", PREMIUM);
    const sig = signWebhookBody(body, config.RAZORPAY_WEBHOOK_SECRET);
    const tampered = body.replace(String(Number(PREMIUM)), String(Number(PREMIUM) + 100));
    const res = await postWebhook(tampered, sig);
    expect(res.status).toBe(400);
  });
});

describe("webhook: verification against the frozen amount", () => {
  it("amount mismatch → 200 (no retry loop) but NO activation, payment stays CREATED", async () => {
    const app = await prisma.application.findFirstOrThrow({
      where: { agentId: AGENT_ID, status: "PAYMENT_PENDING" },
    });
    const payment = await findOpenPayment(app.id);
    const res = await postWebhook(
      paidEventBody(payment!.providerLinkId, "pay_wrong_amount", PREMIUM - 100n),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).note).toContain("anomaly");
    expect((await findOpenPayment(app.id))?.status).toBe("CREATED");
    expect(await prisma.policy.count({ where: { applicationId: app.id } })).toBe(0);
  });

  it("currency mismatch → same fail-closed handling", async () => {
    const app = await prisma.application.findFirstOrThrow({
      where: { agentId: AGENT_ID, status: "PAYMENT_PENDING" },
    });
    const payment = await findOpenPayment(app.id);
    const res = await postWebhook(
      paidEventBody(payment!.providerLinkId, "pay_wrong_currency", PREMIUM, "USD"),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).note).toContain("anomaly");
    expect((await findOpenPayment(app.id))?.status).toBe("CREATED");
    expect(await prisma.policy.count({ where: { applicationId: app.id } })).toBe(0);
  });
});

describe("webhook: activation (happy path + idempotency)", () => {
  it("verified payment → payment PAID, exactly one policy, application ACTIVE, email logged", async () => {
    const app = await prisma.application.findFirstOrThrow({
      where: { agentId: AGENT_ID, status: "PAYMENT_PENDING" },
    });
    const payment = await findOpenPayment(app.id);
    const body = paidEventBody(payment!.providerLinkId, "pay_happy_1", PREMIUM);

    const res = await postWebhook(body);
    expect(res.status).toBe(200);
    expect((await res.json()).note).toBe("activated");

    const after = await prisma.application.findUniqueOrThrow({
      where: { id: app.id },
      include: { policy: true, payments: true, communications: true },
    });
    expect(after.status).toBe("ACTIVE");
    expect(after.payments[0].status).toBe("PAID");
    expect(after.payments[0].providerPaymentId).toBe("pay_happy_1");
    expect(after.payments[0].rawWebhookPayload).toBeTruthy();
    expect(after.policy?.policyNumber).toMatch(/^POL-\d{4}-\d{6}$/);
    const email = after.communications.find((c) => c.templateKey === "policy_confirmation");
    expect(email?.status).toBe("LOGGED"); // EMAIL_MODE=log in dev
    expect(email?.renderedContent).toContain(after.policy!.policyNumber);
  });

  it("duplicate webhook delivery → 200, still exactly one policy", async () => {
    const app = await prisma.application.findFirstOrThrow({
      where: { agentId: AGENT_ID, status: "ACTIVE" },
      include: { payments: true },
    });
    const body = paidEventBody(app.payments[0].providerLinkId, "pay_happy_1", PREMIUM);
    const res = await postWebhook(body);
    expect(res.status).toBe(200);
    expect((await res.json()).note).toBe("already_active");
    expect(await prisma.policy.count({ where: { applicationId: app.id } })).toBe(1);
  });

  it("a stale expired-event after PAID never regresses the payment", async () => {
    const app = await prisma.application.findFirstOrThrow({
      where: { agentId: AGENT_ID, status: "ACTIVE" },
      include: { payments: true },
    });
    const res = await postWebhook(
      linkEventBody("payment_link.expired", app.payments[0].providerLinkId),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).note).toBe("already terminal");
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: app.payments[0].id },
    });
    expect(payment.status).toBe("PAID");
  });

  it("resend path: a second sendPolicyConfirmation adds a second comm row", async () => {
    const app = await prisma.application.findFirstOrThrow({
      where: { agentId: AGENT_ID, status: "ACTIVE" },
    });
    const r = await sendPolicyConfirmation(app.id);
    expect(r.ok).toBe(true);
    const emails = await prisma.communication.count({
      where: { applicationId: app.id, templateKey: "policy_confirmation" },
    });
    expect(emails).toBe(2);
  });
});

describe("expired / cancelled links → AGREED (the one backward edge)", () => {
  it("payment_link.expired terminal-izes the payment and reverts the application", async () => {
    const { appId } = await makeAgreedApp(2);
    await generatePaymentLink(appId);
    const payment = await findOpenPayment(appId);

    const res = await postWebhook(linkEventBody("payment_link.expired", payment!.providerLinkId));
    expect(res.status).toBe(200);

    const after = await prisma.application.findUniqueOrThrow({ where: { id: appId } });
    expect(after.status).toBe("AGREED");
    const pay = await prisma.payment.findUniqueOrThrow({ where: { id: payment!.id } });
    expect(pay.status).toBe("EXPIRED");

    // and the agent can immediately generate a fresh link
    const again = await generatePaymentLink(appId);
    expect(again).toMatchObject({ ok: true, reused: false });
  });

  it("cancel-before-regenerate: old link CANCELLED, fresh link open, app PAYMENT_PENDING", async () => {
    const app = await prisma.application.findFirstOrThrow({
      where: { agentId: AGENT_ID, status: "PAYMENT_PENDING" },
      orderBy: { createdAt: "desc" },
    });
    const oldPayment = await findOpenPayment(app.id);

    const r = await regeneratePaymentLink(app.id);
    expect(r.ok).toBe(true);

    const old = await prisma.payment.findUniqueOrThrow({ where: { id: oldPayment!.id } });
    expect(old.status).toBe("CANCELLED");
    const fresh = await findOpenPayment(app.id);
    expect(fresh).not.toBeNull();
    expect(fresh!.id).not.toBe(oldPayment!.id);
    expect(fresh!.providerLinkId).not.toBe(oldPayment!.providerLinkId);
    const after = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(after.status).toBe("PAYMENT_PENDING");
  });
});

describe("concurrency: webhook and reconcile racing", () => {
  it("two concurrent activations → exactly one 'activated', one policy", async () => {
    const { appId } = await makeAgreedApp(3);
    await generatePaymentLink(appId);
    const payment = await findOpenPayment(appId);

    const event = {
      providerLinkId: payment!.providerLinkId,
      providerPaymentId: "pay_race_1",
      amount: PREMIUM,
      currency: "INR",
      rawPayload: { race: true },
    };
    const [a, b] = await Promise.all([
      activateFromVerifiedPayment(event),
      activateFromVerifiedPayment(event),
    ]);
    const outcomes = [a.outcome, b.outcome].sort();
    expect(outcomes).toEqual(["activated", "already_processed"]);
    expect(await prisma.policy.count({ where: { applicationId: appId } })).toBe(1);
    const after = await prisma.application.findUniqueOrThrow({ where: { id: appId } });
    expect(after.status).toBe("ACTIVE");
  });
});

describe("reconciliation (same activation path as the webhook)", () => {
  it("still_pending while the provider link is unpaid", async () => {
    const { appId } = await makeAgreedApp(4);
    await generatePaymentLink(appId);
    expect(await reconcilePayment(appId)).toMatchObject({ outcome: "still_pending" });
  });

  it("provider-paid link → reconcile activates with a policy", async () => {
    const app = await prisma.application.findFirstOrThrow({
      where: { agentId: AGENT_ID, status: "PAYMENT_PENDING" },
      orderBy: { createdAt: "desc" },
    });
    const payment = await findOpenPayment(app.id);
    mockMarkPaid(payment!.providerLinkId, "pay_reconciled_1");

    const r = await reconcilePayment(app.id);
    expect(r.outcome).toBe("activated");

    const after = await prisma.application.findUniqueOrThrow({
      where: { id: app.id },
      include: { policy: true, payments: true },
    });
    expect(after.status).toBe("ACTIVE");
    expect(after.payments[0].providerPaymentId).toBe("pay_reconciled_1");
    expect(after.policy).not.toBeNull();

    // reconcile again → already_active, still one policy
    expect(await reconcilePayment(app.id)).toMatchObject({ outcome: "already_active" });
    expect(await prisma.policy.count({ where: { applicationId: app.id } })).toBe(1);
  });

  it("provider-expired link → reconcile reverts to AGREED", async () => {
    const { appId } = await makeAgreedApp(5);
    await generatePaymentLink(appId);
    const payment = await findOpenPayment(appId);
    mockMarkExpired(payment!.providerLinkId);

    const r = await reconcilePayment(appId);
    expect(r).toMatchObject({ outcome: "reverted", providerStatus: "expired" });
    const after = await prisma.application.findUniqueOrThrow({ where: { id: appId } });
    expect(after.status).toBe("AGREED");
  });
});
