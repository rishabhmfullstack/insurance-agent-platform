import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { getCustomerForAgent } from "@/lib/data/customers";
import { listProducts } from "@/lib/data/products";
import { prisma } from "@/lib/db";
import { evaluateEligibility } from "@/lib/domain/eligibility";
import { computePremium } from "@/lib/domain/premium";
import { ageInYears } from "@/lib/domain/rules";
import { formatDate, formatPaise, formatPaiseCompact } from "@/lib/format";

export const metadata = { title: "Customer — Insurance Agent Platform" };

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const agent = await requireAgent();
  const { id } = await params;
  const customer = await getCustomerForAgent(id, agent.agentId);

  const [products, applications] = await Promise.all([
    listProducts(),
    prisma.application.findMany({
      where: { customerId: customer.id, agentId: agent.agentId },
      orderBy: { createdAt: "desc" },
      include: { product: true },
    }),
  ]);

  // Same pure evaluator the create-quote guard will use — the panel and the
  // guard cannot disagree (D-09). Premium shown here is a preview; the binding
  // number is frozen at quote creation.
  const now = new Date();
  const evaluated = products.map((p) => ({
    product: p,
    result: evaluateEligibility(customer, p.rules, now),
    premium: computePremium(customer, p.basePremium, p.factors, now),
  }));
  const eligible = evaluated.filter((e) => e.result.eligible);
  const ineligible = evaluated.filter((e) => !e.result.eligible);

  const facts: [string, string][] = [
    ["Age", `${ageInYears(customer.dob, now)} (${formatDate(customer.dob)})`],
    ["Phone", customer.phone],
    ["Email", customer.email],
    ["City", customer.city],
    ["Annual income", formatPaise(customer.annualIncome)],
    ["Smoker", customer.isSmoker ? "Yes" : "No"],
    [
      "Vehicle",
      customer.ownsVehicle ? `Yes — model year ${customer.vehicleYear}` : "No",
    ],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="text-sm text-slate-500 hover:underline">
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">{customer.name}</h1>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-medium text-slate-900">Customer details</h2>
        <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {facts.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 sm:block">
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Applicable products
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {eligible.map(({ product, premium }) => (
            <div
              key={product.id}
              className="rounded-lg border border-green-200 bg-white p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium text-slate-900">{product.name}</h3>
                <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-200">
                  Eligible
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Cover {formatPaiseCompact(product.coverageAmount)}
              </p>
              <p className="mt-3 text-sm text-slate-900">
                Premium{" "}
                <span className="font-semibold">{formatPaise(premium)}</span>
                <span className="text-slate-500"> / year</span>
              </p>
              <p className="mt-3 text-xs text-slate-400">
                Quote creation arrives with the application workflow (next phase).
              </p>
            </div>
          ))}
          {eligible.length === 0 && (
            <p className="text-sm text-slate-500 md:col-span-2">
              No products match this customer&apos;s profile.
            </p>
          )}
        </div>

        {ineligible.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Not eligible
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              {ineligible.map(({ product, result }) => (
                <div
                  key={product.id}
                  className="rounded-lg border border-slate-200 bg-slate-50/50 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-medium text-slate-600">{product.name}</h3>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
                      Not eligible
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {result.reasons.map((r) => (
                      <li key={r} className="text-sm text-slate-500">
                        · {r}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-900">
          Applications
        </h2>
        {applications.length === 0 ? (
          <p className="px-5 py-5 text-sm text-slate-500">
            No applications for this customer yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {applications.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="text-slate-900">{a.product.name}</span>
                <span className="text-slate-500">
                  {formatPaise(a.premiumAmount)} · {a.status} · {formatDate(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
