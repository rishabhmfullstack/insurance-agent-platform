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
});

const parsed = envSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  APP_URL: process.env.APP_URL,
  WHATSAPP_MODE: process.env.WHATSAPP_MODE,
  BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
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
