import { notFound } from "next/navigation";
import { getApplicationByToken } from "@/lib/data/applications";
import { agreeAction } from "@/actions/applications";
import { expireIfStale, isQuoteExpired } from "@/lib/domain/applications";
import { formatDate, formatPaise, formatPaiseCompact } from "@/lib/format";

export const metadata = { title: "Your Insurance Quote" };
export const dynamic = "force-dynamic";

// Zone 2 (capability token): ONE public route rendering by application state.
// Minimal PII by construction — the token-scoped query selects only the
// customer's name (see lib/data/applications.ts). Unknown token → uniform 404
// (no existence oracle). The token grants viewing + exactly one transition.
export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ razorpay_payment_id?: string }>;
}) {
  const { token } = await params;
  const { razorpay_payment_id: cameBackFromPayment } = await searchParams;
  let app = await getApplicationByToken(token);
  if (!app || app.status === "DRAFT") notFound(); // link only ever shared after PDF exists

  // Lazy expiry write-back (D-12); Agree is separately guarded server-side.
  if (isQuoteExpired(app) && app.status !== "EXPIRED") {
    await expireIfStale(app.id);
    app = (await getApplicationByToken(token))!;
  }

  const agreeWithToken = agreeAction.bind(null, token);

  return (
    <main className="flex min-h-screen items-start justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-900">
            Insurance Agent Platform
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Demonstration platform — not a real insurance offer.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-medium text-slate-900">
            Hi {app.customer.name},
          </h2>

          {app.status === "EXPIRED" && (
            <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
              This quote expired on {formatDate(app.validUntil)}. Please ask
              your agent for a fresh quote.
            </p>
          )}

          {app.status === "QUOTE_GENERATED" && (
            <p className="mt-1 text-sm text-slate-500">
              Your agent has prepared this insurance quote for you. Review the
              details and confirm below.
            </p>
          )}

          {app.status === "AGREED" && (
            <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              You agreed to this quote
              {app.agreedAt ? ` on ${formatDate(app.agreedAt)}` : ""}. Your
              agent will send you a payment link on WhatsApp to activate the
              policy.
            </p>
          )}

          {app.status === "PAYMENT_PENDING" && (
            <div className="mt-3 space-y-2">
              {cameBackFromPayment ? (
                // The redirect back from the payment page NEVER writes state —
                // this page only reads what the verified webhook recorded.
                <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
                  If you just completed the payment, verification is in
                  progress — refresh this page in a moment.
                </p>
              ) : (
                <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                  You agreed to this quote
                  {app.agreedAt ? ` on ${formatDate(app.agreedAt)}` : ""}. Pay
                  securely below to activate your policy.
                </p>
              )}
            </div>
          )}

          {app.status === "ACTIVE" && app.policy && (
            <div className="mt-3 rounded-md bg-green-50 px-3 py-2">
              <p className="text-sm font-semibold text-green-800">
                Your policy is active 🎉
              </p>
              <p className="mt-1 text-sm text-green-700">
                Policy number {app.policy.policyNumber} ·{" "}
                {formatDate(app.policy.startDate)} —{" "}
                {formatDate(app.policy.endDate)}. A confirmation has been sent
                to your email.
              </p>
            </div>
          )}

          <dl className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Plan</dt>
              <dd className="font-medium text-slate-900">{app.product.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Coverage</dt>
              <dd className="text-slate-900">
                {formatPaiseCompact(app.product.coverageAmount)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Annual premium</dt>
              <dd className="font-semibold text-slate-900">
                {formatPaise(app.premiumAmount)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Policy term</dt>
              <dd className="text-slate-900">1 year, single payment</dd>
            </div>
            {app.status === "QUOTE_GENERATED" && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Quote valid until</dt>
                <dd className="text-slate-900">{formatDate(app.validUntil)}</dd>
              </div>
            )}
          </dl>

          {app.pdfUrl && (
            <a
              href={app.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-sm font-medium text-slate-900 underline"
            >
              View the full quote document (PDF)
            </a>
          )}

          {app.status === "PAYMENT_PENDING" && app.payments[0] && !cameBackFromPayment && (
            <a
              href={app.payments[0].shortUrl}
              className="mt-6 block w-full rounded-md bg-slate-900 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-slate-700"
            >
              Pay Now — {formatPaise(app.premiumAmount)}
            </a>
          )}

          {app.status === "QUOTE_GENERATED" && (
            <form action={agreeWithToken} className="mt-6">
              <button
                type="submit"
                className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
              >
                I Agree to this quote
              </button>
              <p className="mt-2 text-center text-xs text-slate-400">
                Clicking records your consent with a timestamp. No signature is
                collected in this demo.
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
