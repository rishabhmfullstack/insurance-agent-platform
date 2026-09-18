import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { getApplicationForAgent } from "@/lib/data/applications";
import { expireIfStale, isQuoteExpired } from "@/lib/domain/applications";
import { retryPdfAction } from "@/actions/applications";
import { quoteNumber } from "@/lib/integrations/pdf";
import {
  buildQuoteShareMessage,
  reviewUrlFor,
} from "@/lib/integrations/messaging/whatsapp";
import { formatDate, formatPaise } from "@/lib/format";
import { StatusBadge } from "@/components/applications/status-badge";
import {
  StatusTimeline,
  type TimelineStep,
} from "@/components/applications/status-timeline";
import { ShareQuoteButton } from "@/components/applications/share-quote-button";

export const metadata = { title: "Application — Insurance Agent Platform" };
export const dynamic = "force-dynamic";

export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const agent = await requireAgent();
  const { id } = await params;
  let app = await getApplicationForAgent(id, agent.agentId);

  // Lazy expiry write-back on view (D-12), then re-read the truth.
  if (isQuoteExpired(app) && app.status !== "EXPIRED") {
    await expireIfStale(app.id);
    app = await getApplicationForAgent(id, agent.agentId);
  }
  const expired = app.status === "EXPIRED";

  const quoteShares = app.communications.filter((c) => c.templateKey === "quote_share");
  const lastShare = quoteShares[0];

  const reviewUrl = reviewUrlFor(app.reviewToken);
  const shareMessage = buildQuoteShareMessage({
    customerName: app.customer.name,
    productName: app.product.name,
    premiumDisplay: formatPaise(app.premiumAmount),
    validUntilDisplay: formatDate(app.validUntil),
    reviewUrl,
  });

  const doneUpTo = { DRAFT: 0, QUOTE_GENERATED: 1, AGREED: 3, PAYMENT_PENDING: 4, ACTIVE: 5, EXPIRED: 1 }[
    app.status
  ];
  const steps: TimelineStep[] = [
    {
      label: "Quote created",
      detail: formatDate(app.createdAt),
      state: "done",
    },
    {
      label: "Shared on WhatsApp",
      detail: lastShare ? formatDate(lastShare.createdAt) : undefined,
      state: lastShare ? "done" : doneUpTo >= 1 && !expired ? "current" : "pending",
    },
    {
      label: "Customer agreed",
      detail: app.agreedAt ? formatDate(app.agreedAt) : undefined,
      state: app.agreedAt ? "done" : "pending",
    },
    {
      label: "Payment",
      state: doneUpTo >= 4 ? "done" : app.status === "AGREED" ? "current" : "pending",
    },
    {
      label: "Policy active",
      state: app.status === "ACTIVE" ? "done" : "pending",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/customers/${app.customerId}`}
          className="text-sm text-slate-500 hover:underline"
        >
          ← {app.customer.name}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">
            {app.product.name}
          </h1>
          <StatusBadge status={app.status} />
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Quote {quoteNumber(app.id)} · Premium{" "}
          <span className="font-medium text-slate-900">
            {formatPaise(app.premiumAmount)}
          </span>{" "}
          / year · Valid until {formatDate(app.validUntil)}
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <StatusTimeline steps={steps} />
      </section>

      {/* State-gated actions: exactly one primary action per state. */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        {expired && (
          <div className="text-sm text-slate-600">
            This quote expired on {formatDate(app.validUntil)}.{" "}
            <Link
              href={`/customers/${app.customerId}`}
              className="font-medium text-slate-900 underline"
            >
              Create a new quote
            </Link>{" "}
            from the customer profile.
          </div>
        )}

        {!expired && app.status === "DRAFT" && (
          <div className="space-y-3">
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              The quote PDF could not be generated. The application stays in
              Draft until a PDF exists.
            </p>
            <form action={retryPdfAction}>
              <input type="hidden" name="applicationId" value={app.id} />
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              >
                Retry PDF generation
              </button>
            </form>
          </div>
        )}

        {!expired && app.status === "QUOTE_GENERATED" && (
          <div className="space-y-4">
            <ShareQuoteButton applicationId={app.id} message={shareMessage} />
            <div className="text-sm text-slate-600">
              Customer review link (also contained in the WhatsApp message):{" "}
              <a
                href={reviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all font-medium text-slate-900 underline"
              >
                {reviewUrl}
              </a>
            </div>
          </div>
        )}

        {app.status === "AGREED" && (
          <p className="text-sm text-slate-600">
            Customer agreed on {app.agreedAt ? formatDate(app.agreedAt) : "—"}.
            Payment link generation arrives in the next phase.
          </p>
        )}
      </section>

      {app.pdfUrl && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-medium text-slate-900">Quote document</h2>
          <a
            href={app.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm font-medium text-slate-900 underline"
          >
            View PDF — {quoteNumber(app.id)}.pdf
          </a>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-900">
          Communications
        </h2>
        {app.communications.length === 0 ? (
          <p className="px-5 py-5 text-sm text-slate-500">Nothing sent yet.</p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {app.communications.map((c) => (
              <li key={c.id} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">
                    {c.channel === "WHATSAPP" ? "WhatsApp" : "Email"}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {c.mode === "DEMO" ? "demo click-to-chat" : c.mode.toLowerCase()}
                  </span>
                  <span className="text-xs text-slate-500">
                    {c.templateKey} · {c.status.toLowerCase()} ·{" "}
                    {c.createdAt.toLocaleString("en-IN")}
                  </span>
                </div>
                <pre className="mt-2 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-xs text-slate-600">
                  {c.renderedContent}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
