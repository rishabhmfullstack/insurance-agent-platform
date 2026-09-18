import { requireAgent } from "@/lib/session";

export const metadata = { title: "Dashboard — Insurance Agent Platform" };

export default async function DashboardPage() {
  const agent = await requireAgent();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          Welcome, {agent.name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Your customers and applications will appear here.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-medium text-slate-900">My Customers</h2>
          <p className="mt-3 text-sm text-slate-500">
            No customers yet. Customer management arrives in the next phase.
          </p>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-medium text-slate-900">
            Recent Applications
          </h2>
          <p className="mt-3 text-sm text-slate-500">
            No applications yet. Quotes and the application workflow arrive in a
            later phase.
          </p>
        </section>
      </div>
    </div>
  );
}
