import { z } from "zod";

// Fail-fast env validation (D: config.ts is the single place env is read).
// Later phases extend this with Razorpay/Resend/Blob vars and the
// WHATSAPP_MODE / EMAIL_MODE flags.
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  APP_URL: z.url().default("http://localhost:3000"),
  /** demo = wa.me click-to-chat, honestly labeled (D-06). cloud-api is the
   * production seam, implemented only if time remains. */
  WHATSAPP_MODE: z.enum(["demo", "cloud-api"]).default("demo"),
  /** Vercel Blob token. Absent → PDFs fall back to local file storage
   * (dev only; the deployed app always runs in blob mode). */
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  /** Razorpay TEST-mode keys. Absent → the in-memory mock provider (dev/tests
   * only; the deployed app always has real test keys). */
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  /** Shared secret for webhook HMAC verification. The dev default exists so
   * signed-fixture tests work without a Razorpay account — the deployment
   * MUST set the real dashboard value. */
  RAZORPAY_WEBHOOK_SECRET: z
    .string()
    .min(8)
    .default("dev-webhook-secret-not-for-production"),
  /** live = real sends via Resend; log = render into the communications log
   * only (both are honest, README-documented modes — D-07). */
  EMAIL_MODE: z.enum(["live", "log"]).default("log"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z
    .string()
    .default("Insurance Agent Platform <onboarding@resend.dev>"),
});

const parsed = envSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  APP_URL: process.env.APP_URL,
  WHATSAPP_MODE: process.env.WHATSAPP_MODE,
  BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
  EMAIL_MODE: process.env.EMAIL_MODE,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
});

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const config = parsed.data;

/** PDF storage mode is derived, not declared: blob when a token exists. */
export const pdfStorageMode: "blob" | "local" = config.BLOB_READ_WRITE_TOKEN
  ? "blob"
  : "local";

/** Payment provider mode is derived the same way: real Razorpay test-mode
 * when keys exist, otherwise the in-memory mock (dev/tests only). */
export const paymentMode: "razorpay" | "mock" =
  config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_SECRET ? "razorpay" : "mock";
