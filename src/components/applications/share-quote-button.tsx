"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { shareQuoteAction } from "@/actions/applications";

// Demo WhatsApp share (D-06): the server logs the rendered message, then the
// browser opens wa.me so the agent sends it from their own WhatsApp. Labeled
// as demo mode in the UI — no pretense of API delivery.
export function ShareQuoteButton({
  applicationId,
  message,
}: {
  applicationId: string;
  message: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);

  async function share() {
    setBusy(true);
    setError(undefined);
    try {
      const res = await shareQuoteAction(applicationId);
      if (res.ok) {
        window.open(res.waUrl, "_blank", "noopener");
        router.refresh();
      } else {
        setError(res.error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy — select and copy the message manually.");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={share}
          disabled={busy}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {busy ? "Preparing…" : "Share PDF on WhatsApp"}
        </button>
        <button
          onClick={copy}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
        >
          {copied ? "Copied ✓" : "Copy message"}
        </button>
        <span className="text-xs text-slate-500">
          Demo mode (click-to-chat) — opens WhatsApp with the message prefilled.
        </span>
      </div>
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
    </div>
  );
}
