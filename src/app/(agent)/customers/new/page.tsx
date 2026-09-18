import { requireAgent } from "@/lib/session";
import { CustomerForm } from "@/components/customers/customer-form";

export const metadata = { title: "New Customer — Insurance Agent Platform" };

export default async function NewCustomerPage() {
  await requireAgent();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">New Customer</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every field below feeds eligibility rules, premium calculation or the
          quote document. Customers cannot be edited after creation in this MVP.
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <CustomerForm />
      </div>
    </div>
  );
}
