// Display helpers. All storage is BIGINT paise (D-13); rupees exist only at
// the presentation and form boundaries.

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** "₹8,000" from paise. Premiums/incomes are whole rupees by construction. */
export function formatPaise(paise: bigint): string {
  return `₹${inr.format(paise / 100n)}`;
}

/** Compact display for large covers: "₹50L", "₹1Cr". */
export function formatPaiseCompact(paise: bigint): string {
  const rupees = paise / 100n;
  if (rupees >= 10000000n && rupees % 10000000n === 0n)
    return `₹${rupees / 10000000n}Cr`;
  if (rupees >= 100000n && rupees % 100000n === 0n)
    return `₹${rupees / 100000n}L`;
  return formatPaise(paise);
}

export function rupeesToPaise(rupees: number): bigint {
  return BigInt(Math.round(rupees)) * 100n;
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
