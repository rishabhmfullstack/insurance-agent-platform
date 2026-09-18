import { randomBytes } from "crypto";
import type {
  CreateLinkInput,
  CreatedLink,
  LinkStatus,
  PaymentProvider,
} from "./provider";

// DEV/TEST-ONLY in-memory payment provider, active exactly when no Razorpay
// keys are configured (paymentMode === "mock"). It exists so the full payment
// flow is exercisable locally and in integration tests without an account —
// it is never a substitute for the real test-mode API and the deployed app
// never runs in this mode (README service matrix states the active mode).

type MockLink = {
  input: CreateLinkInput;
  status: "created" | "paid" | "cancelled" | "expired";
  paymentId?: string;
};

const links = new Map<string, MockLink>();

export const mockProvider: PaymentProvider = {
  async createPaymentLink(input: CreateLinkInput): Promise<CreatedLink> {
    const linkId = `plink_mock_${randomBytes(6).toString("hex")}`;
    links.set(linkId, { input, status: "created" });
    return {
      linkId,
      // Deliberately inert URL — clearly a mock, nothing pretends to charge.
      shortUrl: `https://mock-payments.invalid/pay/${linkId}`,
    };
  },

  async cancelPaymentLink(linkId: string): Promise<void> {
    const link = links.get(linkId);
    if (link && link.status === "created") link.status = "cancelled";
  },

  async fetchLinkStatus(linkId: string): Promise<LinkStatus> {
    const link = links.get(linkId);
    if (!link) return { status: "created" }; // unknown → pending, fail closed
    if (link.status === "paid") {
      return {
        status: "paid",
        paymentId: link.paymentId ?? `pay_mock_${linkId.slice(-6)}`,
        amount: link.input.amount,
        currency: link.input.currency,
        raw: { mock: true, linkId },
      };
    }
    return { status: link.status };
  },
};

/** Test/dev helpers — simulate provider-side state changes. */
export function mockMarkPaid(linkId: string, paymentId?: string): void {
  const link = links.get(linkId);
  if (!link) throw new Error(`mock link ${linkId} not found`);
  link.status = "paid";
  link.paymentId = paymentId ?? `pay_mock_${randomBytes(5).toString("hex")}`;
}

export function mockMarkExpired(linkId: string): void {
  const link = links.get(linkId);
  if (!link) throw new Error(`mock link ${linkId} not found`);
  link.status = "expired";
}
