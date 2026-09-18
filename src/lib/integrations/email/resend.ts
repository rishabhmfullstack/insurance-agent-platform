import { config } from "@/lib/config";

// Email adapter (D-07). `live` sends through the Resend REST API; `log`
// renders only (the workflow records it in communications either way, so the
// reviewer always sees the email content). Both modes are honest and
// README-documented.

export type EmailInput = { to: string; subject: string; text: string };

export type EmailSendResult =
  | { sent: true }
  | { sent: false; logged: true }
  | { sent: false; logged: false; error: string };

export async function sendEmail(input: EmailInput): Promise<EmailSendResult> {
  if (config.EMAIL_MODE === "log") {
    return { sent: false, logged: true };
  }
  if (!config.RESEND_API_KEY) {
    return {
      sent: false,
      logged: false,
      error: "EMAIL_MODE=live but RESEND_API_KEY is not configured",
    };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.EMAIL_FROM,
        to: [input.to],
        subject: input.subject,
        text: input.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        sent: false,
        logged: false,
        error: `Resend ${res.status}: ${body.slice(0, 300)}`,
      };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, logged: false, error: (e as Error).message };
  }
}

export function buildPolicyConfirmationEmail(input: {
  customerName: string;
  policyNumber: string;
  productName: string;
  coverageDisplay: string;
  premiumDisplay: string;
  startDateDisplay: string;
  endDateDisplay: string;
}): { subject: string; text: string } {
  return {
    subject: `Your policy ${input.policyNumber} is active`,
    text: [
      `Hi ${input.customerName},`,
      ``,
      `Your payment is verified and your policy is now active.`,
      ``,
      `Policy number: ${input.policyNumber}`,
      `Plan: ${input.productName}`,
      `Coverage: ${input.coverageDisplay}`,
      `Premium paid: ${input.premiumDisplay}`,
      `Policy period: ${input.startDateDisplay} to ${input.endDateDisplay}`,
      ``,
      `Keep this email for your records.`,
      ``,
      `— Insurance Agent Platform`,
      ``,
      `(Demonstration platform — this is not a real insurance policy. All data is fictional.)`,
    ].join("\n"),
  };
}
