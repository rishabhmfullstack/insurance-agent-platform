import { createHmac, timingSafeEqual } from "crypto";

/** Verifies the Razorpay webhook signature against the RAW request body
 * (never a re-serialized parse — byte differences break HMAC). Constant-time
 * comparison; any malformed input verifies false rather than throwing. */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Test/dev helper: produce a valid signature for a fixture body. */
export function signWebhookBody(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}
