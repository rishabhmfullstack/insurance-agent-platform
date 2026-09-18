import { requireAgent } from "@/lib/session";
import { listProducts, describeRules } from "@/lib/data/products";
import { formatPaise, formatPaiseCompact } from "@/lib/format";

export const metadata = { title: "Products — Insurance Agent Platform" };

const CATEGORY_LABELS: Record<string, string> = {
  TERM: "Term Insurance",
  HEALTH: "Health Insurance",
  VEHICLE: "Vehicle Insurance",
  OTHER: "Other Insurance",
};

// Read-only catalogue. Deliberately no "select" button here: a product without
// a customer has no premium and no eligibility verdict — selection happens on
// the customer profile where that context exists.
export default async function ProductsPage() {
  await requireAgent();
  const products = await listProducts();

  const byCategory = new Map<string, typeof products>();
  for (const p of products) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Product Catalogue</h1>
        <p className="mt-1 text-sm text-slate-500">
          To create a quote, open a customer profile — eligibility and premium
          are evaluated per customer.
        </p>
      </div>

      {[...byCategory.entries()].map(([category, items]) => (
        <section key={category}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {CATEGORY_LABELS[category] ?? category}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border border-slate-200 bg-white p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-medium text-slate-900">{p.name}</h3>
                  <span className="whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                    Cover {formatPaiseCompact(p.coverageAmount)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{p.description}</p>
                <p className="mt-3 text-sm text-slate-900">
                  Base premium{" "}
                  <span className="font-semibold">{formatPaise(p.basePremium)}</span>
                  <span className="text-slate-500"> / year</span>
                </p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {describeRules(p.rules).map((r) => (
                    <li
                      key={r}
                      className="rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600 ring-1 ring-inset ring-slate-200"
                    >
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
