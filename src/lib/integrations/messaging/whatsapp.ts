import { config } from "@/lib/config";

// WhatsApp integration (D-06). Mode `demo`: the server renders the real
// message and logs it to communications; the browser opens a wa.me
// click-to-chat URL — honestly labeled in the UI, never presented as API
// delivery. Mode `cloud-api` is the production seam (Meta Cloud API), only
// implemented if time remains; config.WHATSAPP_MODE selects it.

export function reviewUrlFor(token: string): string {
  return `${config.APP_URL}/review/${token}`;
}

export function buildQuoteShareMessage(input: {
  customerName: string;
  productName: string;
  premiumDisplay: string;
  validUntilDisplay: string;
  reviewUrl: string;
}): string {
  return [
    `Hi ${input.customerName}, here is your insurance quote:`,
    ``,
    `${input.productName}`,
    `Premium: ${input.premiumDisplay} / year`,
    `Quote valid until ${input.validUntilDisplay}`,
    ``,
    `Review the details and confirm here:`,
    input.reviewUrl,
    ``,
    `(Demo message — this is a demonstration platform, not a real insurance offer.)`,
  ].join("\n");
}

/** Click-to-chat deep link: opens WhatsApp with the message prefilled for the
 * agent to send from their own account. */
export function waMeUrl(phone: string, message: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
