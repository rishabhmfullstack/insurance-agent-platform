import { paymentMode } from "@/lib/config";
import { razorpayProvider } from "./razorpay";
import { mockProvider } from "./mock";

// The payment-provider seam (D-04/D-05). Razorpay-specific code stays behind
// this interface; domain and workflows never see vendor shapes.

export type CreateLinkInput = {
  /** paise — always the application's FROZEN premium */
  amount: bigint;
  currency: "INR";
  description: string;
  referenceId: string; // application id
  customerName: string;
  customerPhone: string;
  /** where the provider redirects the customer after payment — the review
   * page, which only READS state (the redirect never activates anything). */
  callbackUrl: string;
};

export type CreatedLink = { linkId: string; shortUrl: string };

export type LinkStatus =
  | { status: "created" }
  | { status: "paid"; paymentId: string; amount: bigint; currency: string; raw: unknown }
  | { status: "cancelled" }
  | { status: "expired" };

export interface PaymentProvider {
  createPaymentLink(input: CreateLinkInput): Promise<CreatedLink>;
  cancelPaymentLink(linkId: string): Promise<void>;
  fetchLinkStatus(linkId: string): Promise<LinkStatus>;
}

export function getPaymentProvider(): PaymentProvider {
  return paymentMode === "razorpay" ? razorpayProvider : mockProvider;
}
