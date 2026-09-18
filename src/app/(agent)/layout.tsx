import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { signOutAction } from "@/actions/auth";

// Routing-level guard for the whole agent zone (UX). Enforcement stays in
// requireAgent() + agentId-scoped queries inside every page/action (D-18).
export default async function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const agent = await requireAgent();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <nav className="flex items-center gap-6">
            <Link href="/dashboard" className="text-sm font-semibold text-slate-900">
              Insurance Agent Platform
            </Link>
            <Link
              href="/dashboard"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Dashboard
            </Link>
            <Link
              href="/products"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Products
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500">{agent.name}</span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
