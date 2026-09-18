"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  generatePaymentLinkAction,
  regeneratePaymentLinkAction,
  sharePaymentLinkAction,
  verifyPaymentAction,
} from "@/actions/payments";

// State-gated payment actions for AGREED / PAYMENT_PENDING. All truth lives
// server-side — these buttons just invoke actions and refresh.
export function PaymentPanel({
  applicationId,
  status,
  paymentUrl,
}: {
  applicationId: string;
  status: "AGREED" | "PAYMENT_PENDING";
  paymentUrl?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [notice, setNotice] = useState<{ ok: boolean; message: string }>();
  const [copied, setCopied] = useState(false);

  async function run(
    key: string,
    fn: () => Promise<{ ok: boolean; message?: string; waUrl?: string }>,
  ) {
    setBusy(key);
    setNotice(undefined);
    try {
      const res = await fn();
      if ("waUrl" in res && res.waUrl) {
        window.open(res.waUrl, "_blank", "noopener");
      }
      if ("message" in res && res.message) {
        setNotice({ ok: res.ok, message: res.message });
      }
      router.refresh();
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <div className="space-y-3">
      {status === "AGREED" && (
        <button
          onClick={() => run("gen", () => generatePaymentLinkAction(applicationId))}
          disabled={busy !== undefined}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {busy === "gen" ? "Creating link…" : "Generate Payment Link"}
        </button>
      )}

      {status === "PAYMENT_PENDING" && (
        <>
          {paymentUrl && (
            <p className="text-sm text-slate-600">
              Payment link:{" "}
              <a
                href={paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all font-medium text-slate-900 underline"
              >
                {paymentUrl}
              </a>{" "}
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(paymentUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {}
                }}
                className="ml-1 rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => run("share", () => sharePaymentLinkAction(applicationId))}
              disabled={busy !== undefined}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              {busy === "share" ? "Preparing…" : "Share Payment Link on WhatsApp"}
            </button>
            <button
              onClick={() => run("verify", () => verifyPaymentAction(applicationId))}
              disabled={busy !== undefined}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              {busy === "verify" ? "Checking…" : "Verify Payment Status"}
            </button>
            <button
              onClick={() => run("regen", () => regeneratePaymentLinkAction(applicationId))}
              disabled={busy !== undefined}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              {busy === "regen" ? "Regenerating…" : "Cancel & Regenerate Link"}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            The webhook is the source of truth; “Verify Payment Status” queries
            the provider directly through the same activation path — a safety
            net if a webhook is missed.
          </p>
        </>
      )}

      {notice && (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            notice.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {notice.message}
        </p>
      )}
    </div>
  );
}
