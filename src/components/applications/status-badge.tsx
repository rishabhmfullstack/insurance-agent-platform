import type { ApplicationStatus } from "@prisma/client";

const STYLES: Record<string, string> = {
  DRAFT: "bg-amber-50 text-amber-700 ring-amber-200",
  QUOTE_GENERATED: "bg-blue-50 text-blue-700 ring-blue-200",
  AGREED: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  PAYMENT_PENDING: "bg-purple-50 text-purple-700 ring-purple-200",
  ACTIVE: "bg-green-50 text-green-700 ring-green-200",
  EXPIRED: "bg-slate-100 text-slate-500 ring-slate-200",
};

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft — PDF pending",
  QUOTE_GENERATED: "Quote ready",
  AGREED: "Customer agreed",
  PAYMENT_PENDING: "Payment pending",
  ACTIVE: "Policy active",
  EXPIRED: "Expired",
};

export function StatusBadge({
  status,
  expired,
}: {
  status: ApplicationStatus;
  /** derived expiry (write-back may not have run) overrides the stored status */
  expired?: boolean;
}) {
  const key = expired ? "EXPIRED" : status;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[key]}`}
    >
      {STATUS_LABELS[key]}
    </span>
  );
}
