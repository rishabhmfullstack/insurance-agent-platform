import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { verifyWebhookSignature } from "@/lib/integrations/payments/signature";
import { processWebhookEvent } from "@/lib/workflows/payment-flow";

// Zone 3 (machine): no session, no token — the HMAC signature over the RAW
// body IS the authentication. Invalid signature → 400 and nothing executes.
// Everything after verification returns 200 (processed / duplicate / ignored /
// logged anomaly) so the provider stops retrying; only a signature failure
// asks for a retry. The redirect back to the review page NEVER reaches this
// code — activation happens here or via the reconcile action, nowhere else.
export async function POST(req: Request): Promise<NextResponse> {
  const rawBody = await req.text(); // BEFORE any parsing — bytes are the contract

  const signature = req.headers.get("x-razorpay-signature");
  if (!verifyWebhookSignature(rawBody, signature, config.RAZORPAY_WEBHOOK_SECRET)) {
    console.error("webhook rejected: invalid signature");
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ note: "unparseable body ignored" }, { status: 200 });
  }

  const result = await processWebhookEvent(event);
  return NextResponse.json({ note: result.note }, { status: result.httpStatus });
}
