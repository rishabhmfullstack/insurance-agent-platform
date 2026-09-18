import {
  ageInYears,
  vehicleAgeYears,
  type CustomerFacts,
  type PremiumFactors,
} from "./rules";

// Pure premium calculator (D-09/D-10): annual premium, one-time payment,
// 1-year term. premium = base × ageBandFactor × productFactors, multiplied
// first and rounded ONCE at the end to whole rupees (never round intermediate
// values). The result is frozen on the application at quote creation.

/** Half-open bands, no overlap: 18–30 / 31–45 / 46–59 / 60+ */
const AGE_BANDS: { maxAge: number; factor: number }[] = [
  { maxAge: 30, factor: 1.0 },
  { maxAge: 45, factor: 1.3 },
  { maxAge: 59, factor: 1.7 },
  { maxAge: Infinity, factor: 2.2 },
];

export function ageBandFactor(age: number): number {
  return AGE_BANDS.find((b) => age <= b.maxAge)!.factor;
}

/** @returns annual premium in paise (whole rupees × 100) */
export function computePremium(
  customer: CustomerFacts,
  basePremium: bigint, // paise
  factors: PremiumFactors,
  asOf: Date = new Date(),
): bigint {
  const age = ageInYears(customer.dob, asOf);
  let combined = ageBandFactor(age);

  if (customer.isSmoker && factors.smokerFactor !== undefined) {
    combined *= factors.smokerFactor;
  }

  if (
    customer.ownsVehicle &&
    customer.vehicleYear !== null &&
    factors.vehicleAgeThreshold !== undefined &&
    factors.vehicleAgeFactor !== undefined &&
    vehicleAgeYears(customer.vehicleYear, asOf) > factors.vehicleAgeThreshold
  ) {
    combined *= factors.vehicleAgeFactor;
  }

  // Round once, to whole rupees. Base premiums are ≤ crores of paise, far
  // inside Number's safe range, so the float excursion is exact enough.
  const rupees = Math.round((Number(basePremium) / 100) * combined);
  return BigInt(rupees) * 100n;
}
