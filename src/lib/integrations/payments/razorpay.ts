import { config } from "@/lib/config";
import type {
  CreateLinkInput,
  CreatedLink,
  LinkStatus,
  PaymentProvider,
} from "./provider";

// Razorpay TEST-mode REST adapter (Payment Links API). Plain fetch + Basic
// auth — no SDK dependency. All Razorpay-specific shapes live in this file.
// NOTE: written against the documented API; end-to-end verification against
// the real test API happens when account keys exist (tracked in ai-log 05).

const BASE = "https://api.razorpay.com/v1";

function authHeader(): string {
  const creds = `${config.RAZORPAY_KEY_ID}:${config.RAZORPAY_KEY_SECRET}`;
  return `Basic ${Buffer.from(creds).toString("base64")}`;
}

async function rzp<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Razorpay ${path} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

type RzpPaymentLink = {
  id: string;
  short_url: string;
  status: "created" | "partially_paid" | "paid" | "cancelled" | "expired";
  currency: string;
  payments?: { payment_id: string; status: string; amount: number }[] | null;
};

export const razorpayProvider: PaymentProvider = {
  async createPaymentLink(input: CreateLinkInput): Promise<CreatedLink> {
    const link = await rzp<RzpPaymentLink>("/payment_links", {
      method: "POST",
      body: JSON.stringify({
        amount: Number(input.amount), // paise — Razorpay's native unit (D-13)
        currency: input.currency,
        description: input.description,
        reference_id: input.referenceId,
        customer: { name: input.customerName, contact: input.customerPhone },
        notify: { sms: false, email: false }, // we share via WhatsApp ourselves
        callback_url: input.callbackUrl,
        callback_method: "get",
      }),
    });
    return { linkId: link.id, shortUrl: link.short_url };
  },

  async cancelPaymentLink(linkId: string): Promise<void> {
    await rzp(`/payment_links/${linkId}/cancel`, { method: "POST" });
  },

  async fetchLinkStatus(linkId: string): Promise<LinkStatus> {
    const link = await rzp<RzpPaymentLink>(`/payment_links/${linkId}`);
    if (link.status === "paid" || link.status === "partially_paid") {
      const captured = link.payments?.find((p) => p.status === "captured");
      if (!captured) {
        // paid link without a captured payment listed — treat as pending and
        // let the webhook (or a later reconcile) settle it. Fail closed.
        return { status: "created" };
      }
      return {
        status: "paid",
        paymentId: captured.payment_id,
        amount: BigInt(captured.amount),
        currency: link.currency,
        raw: link,
      };
    }
    if (link.status === "cancelled") return { status: "cancelled" };
    if (link.status === "expired") return { status: "expired" };
    return { status: "created" };
  },
};
