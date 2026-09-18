import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { listCustomersForAgent } from "@/lib/data/customers";
import { prisma } from "@/lib/db";
import { formatDate, formatPaise } from "@/lib/format";

export const metadata = { title: "Dashboard — Insurance Agent Platform" };

export default async function DashboardPage() {
  const agent = await requireAgent();
  const [customers, applications] = await Promise.all([
    listCustomersForAgent(agent.agentId),
    prisma.application.findMany({
      where: { agentId: agent.agentId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { customer: true, product: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Welcome, {agent.name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {customers.length} customer{customers.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href="/customers/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          + New Customer
        </Link>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-900">
          My Customers
        </h2>
        {customers.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">
            No customers yet.{" "}
            <Link href="/customers/new" className="font-medium text-slate-900 underline">
              Create your first customer
            </Link>{" "}
            to see which products they qualify for.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2 font-medium">Name</th>
                <th className="px-5 py-2 font-medium">Phone</th>
                <th className="px-5 py-2 font-medium">City</th>
                <th className="px-5 py-2 font-medium text-right">Applications</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-2.5">
                    <Link
                      href={`/customers/${c.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-5 py-2.5 text-slate-600">{c.phone}</td>
                  <td className="px-5 py-2.5 text-slate-600">{c.city}</td>
                  <td className="px-5 py-2.5 text-right text-slate-600">
                    {c._count.applications}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-900">
          Recent Applications
        </h2>
        {applications.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">
            No applications yet. Quote creation arrives with the application
            workflow (next phase).
          </p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {applications.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="text-slate-900">
                  {a.customer.name} — {a.product.name}
                </span>
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
