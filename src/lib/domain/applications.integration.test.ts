import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  agreeByToken,
  attachPdf,
  createDraftQuote,
  expireIfStale,
  isQuoteExpired,
} from "./applications";
import { computePremium } from "./premium";
import { premiumFactorsSchema } from "./rules";
import { getApplicationByToken } from "@/lib/data/applications";

// Integration tests for the state-machine chokepoint, against the REAL local
// PostgreSQL (requires DATABASE_URL + the dev database running; see README).
// Uses throwaway rows with fixed ids so it can't disturb seeded demo data.

const prisma = new PrismaClient();

const AGENT_ID = "00000000-0000-4000-8000-0000000a0001";
const PRODUCT_ID = "00000000-0000-4000-8000-00000000f101";
let customerId: string;
let customer2Id: string;

const PAST = new Date(Date.now() - 40 * 24 * 3600 * 1000);

async function cleanup() {
  await prisma.communication.deleteMany({
    where: { application: { agentId: AGENT_ID } },
  });
  await prisma.application.deleteMany({ where: { agentId: AGENT_ID } });
  await prisma.customer.deleteMany({ where: { agentId: AGENT_ID } });
  await prisma.product.deleteMany({ where: { id: PRODUCT_ID } });
  await prisma.agent.deleteMany({ where: { id: AGENT_ID } });
}

beforeAll(async () => {
  await cleanup();
  await prisma.agent.create({
    data: {
      id: AGENT_ID,
      name: "IT Agent",
      email: "it-agent@example.com",
      passwordHash: "x",
    },
  });
  await prisma.product.create({
    data: {
      id: PRODUCT_ID,
      category: "TERM",
      name: "IT Term Product",
      description: "integration test product",
      coverageAmount: 500000n * 100n,
      basePremium: 8000n * 100n,
      eligibilityRules: { minAge: 18, maxAge: 60, minIncome: Number(300000n * 100n) },
      premiumFactors: { smokerFactor: 1.5 },
    },
  });
  const c1 = await prisma.customer.create({
    data: {
      agentId: AGENT_ID,
      name: "IT Customer",
      phone: "+911111100001",
      email: "it-c1@example.com",
      dob: new Date("1991-02-10"), // 35
      annualIncome: 1200000n * 100n,
      city: "Testville",
      isSmoker: true,
      ownsVehicle: false,
    },
  });
  const c2 = await prisma.customer.create({
    data: {
      agentId: AGENT_ID,
      name: "IT Senior",
      phone: "+911111100002",
      email: "it-c2@example.com",
      dob: new Date("1950-01-01"), // 76 — ineligible for the term product
      annualIncome: 1200000n * 100n,
      city: "Testville",
      isSmoker: false,
      ownsVehicle: false,
    },
  });
  customerId = c1.id;
  customer2Id = c2.id;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("createDraftQuote", () => {
  it("rejects an ineligible customer with reasons (server-side re-check)", async () => {
    const r = await createDraftQuote(AGENT_ID, customer2Id, PRODUCT_ID);
    expect(r).toMatchObject({ ok: false, reason: "ineligible" });
    if (!r.ok && r.reason === "ineligible") {
      expect(r.details[0]).toMatch(/exceeds the maximum/);
    }
  });

  it("rejects a customer belonging to a different agent as not_found", async () => {
    const other = "00000000-0000-4000-8000-00000000aaff";
    const r = await createDraftQuote(other, customerId, PRODUCT_ID);
    expect(r).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("creates a DRAFT with the premium FROZEN to the pure function's result", async () => {
    const r = await createDraftQuote(AGENT_ID, customerId, PRODUCT_ID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const app = await prisma.application.findUniqueOrThrow({
      where: { id: r.applicationId },
    });
    expect(app.status).toBe("DRAFT");
    expect(app.pdfUrl).toBeNull();
    expect(app.reviewToken.length).toBeGreaterThanOrEqual(20); // 16 bytes base64url

    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    const product = await prisma.product.findUniqueOrThrow({ where: { id: PRODUCT_ID } });
    const expected = computePremium(
      customer,
      product.basePremium,
      premiumFactorsSchema.parse(product.premiumFactors),
      app.createdAt,
    );
    expect(app.premiumAmount).toBe(expected); // 8000 × 1.3 × 1.5 = ₹15,600
    expect(app.premiumAmount).toBe(15600n * 100n);
  });

  it("blocks a duplicate open quote and reports the existing application", async () => {
    const r = await createDraftQuote(AGENT_ID, customerId, PRODUCT_ID);
    expect(r.ok).toBe(false);
    if (r.ok || r.reason !== "duplicate") throw new Error("expected duplicate");
    expect(r.existingApplicationId).toBeTruthy();
  });
});

describe("attachPdf (DRAFT → QUOTE_GENERATED)", () => {
  it("transitions exactly once", async () => {
    const app = await prisma.application.findFirstOrThrow({
      where: { customerId, productId: PRODUCT_ID, status: "DRAFT" },
    });
    expect(await attachPdf(app.id, "http://example.com/q.pdf")).toBe(true);
    expect(await attachPdf(app.id, "http://example.com/other.pdf")).toBe(false); // not DRAFT anymore

    const after = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(after.status).toBe("QUOTE_GENERATED");
    expect(after.pdfUrl).toBe("http://example.com/q.pdf");
  });
});

describe("review token access", () => {
  it("returns the application for a valid token with MINIMAL customer fields", async () => {
    const app = await prisma.application.findFirstOrThrow({
      where: { customerId, productId: PRODUCT_ID },
    });
    const viaToken = await getApplicationByToken(app.reviewToken);
    expect(viaToken?.id).toBe(app.id);
    // Only the name crosses the token boundary — no dob/income/phone/email.
    expect(viaToken?.customer).toEqual({ name: "IT Customer" });
  });

  it("returns null for an unknown token (page maps to uniform 404)", async () => {
    expect(await getApplicationByToken("definitely-not-a-token-123")).toBeNull();
  });
});

describe("agreeByToken", () => {
  it("agrees a valid quote and records agreedAt; idempotent on repeat", async () => {
    const app = await prisma.application.findFirstOrThrow({
      where: { customerId, productId: PRODUCT_ID, status: "QUOTE_GENERATED" },
    });
    expect(await agreeByToken(app.reviewToken)).toBe("agreed");
    expect(await agreeByToken(app.reviewToken)).toBe("already_agreed");

    const after = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(after.status).toBe("AGREED");
    expect(after.agreedAt).not.toBeNull();
  });

  it("returns invalid for an unknown token", async () => {
    expect(await agreeByToken("nope-nope-nope-nope")).toBe("invalid");
  });
});

describe("expiry (lazy write-back, D-12)", () => {
  it("refuses agreement past validity, writes back EXPIRED, and frees the slot", async () => {
    // AGREED app from the previous suite still holds the slot for customer 1 —
    // use a fresh expired quote via direct insert on customer 2's product pair.
    // Make customer2 eligible by using a fresh eligible customer instead:
    const c3 = await prisma.customer.create({
      data: {
        agentId: AGENT_ID,
        name: "IT Expiry",
        phone: "+911111100003",
        email: "it-c3@example.com",
        dob: new Date("1998-04-15"),
        annualIncome: 800000n * 100n,
        city: "Testville",
        isSmoker: false,
        ownsVehicle: false,
      },
    });

    const draft = await createDraftQuote(AGENT_ID, c3.id, PRODUCT_ID);
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    await attachPdf(draft.applicationId, "http://example.com/e.pdf");
    // Backdate validity (simulates 30+ days passing).
    await prisma.application.update({
      where: { id: draft.applicationId },
      data: { validUntil: PAST },
    });
    const app = await prisma.application.findUniqueOrThrow({
      where: { id: draft.applicationId },
    });

    expect(isQuoteExpired(app)).toBe(true); // derived, before write-back
    expect(await agreeByToken(app.reviewToken)).toBe("expired"); // fail-closed
    const after = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(after.status).toBe("EXPIRED"); // write-back happened
    expect(await agreeByToken(app.reviewToken)).toBe("expired"); // stable

    // EXPIRED freed the partial-unique slot: a new quote for the same
    // customer+product succeeds (create-quote path also does write-back).
    const again = await createDraftQuote(AGENT_ID, c3.id, PRODUCT_ID);
    expect(again.ok).toBe(true);
  });

  it("expireIfStale never touches AGREED applications (validity gates acceptance, not payment)", async () => {
    const agreed = await prisma.application.findFirstOrThrow({
      where: { customerId, productId: PRODUCT_ID, status: "AGREED" },
    });
    await prisma.application.update({
      where: { id: agreed.id },
      data: { validUntil: PAST }, // even with validity long past…
    });
    expect(await expireIfStale(agreed.id)).toBe(false);
    const after = await prisma.application.findUniqueOrThrow({ where: { id: agreed.id } });
    expect(after.status).toBe("AGREED"); // …the live deal survives
    expect(isQuoteExpired(after)).toBe(false); // derived check agrees
  });
});
