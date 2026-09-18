import {
  ageInYears,
  vehicleAgeYears,
  type CustomerFacts,
  type EligibilityRules,
} from "./rules";
import { formatPaise } from "@/lib/format";

// Pure eligibility evaluator (D-09). Deterministic demo rules — NOT real
// underwriting. Called identically by the profile panel and the create-quote
// guard so the two can never disagree. Age bounds are INCLUSIVE on both ends;
// evaluation happens once, at quote creation, and is frozen with the quote.

export type EligibilityResult = {
  eligible: boolean;
  /** Human-readable failure reasons, shown verbatim in the UI. */
  reasons: string[];
};

export function evaluateEligibility(
  customer: CustomerFacts,
  rules: EligibilityRules,
  asOf: Date = new Date(),
): EligibilityResult {
  const reasons: string[] = [];
  const age = ageInYears(customer.dob, asOf);

  if (age < rules.minAge) {
    reasons.push(`Age ${age} is below the minimum ${rules.minAge}`);
  }
  if (age > rules.maxAge) {
    reasons.push(`Age ${age} exceeds the maximum ${rules.maxAge}`);
  }

  if (rules.minIncome !== undefined && customer.annualIncome < BigInt(rules.minIncome)) {
    reasons.push(
      `Annual income ${formatPaise(customer.annualIncome)} is below the minimum ${formatPaise(BigInt(rules.minIncome))}`,
    );
  }

  if (rules.requiresVehicle) {
    if (!customer.ownsVehicle || customer.vehicleYear === null) {
      reasons.push("Requires a vehicle");
    } else if (rules.maxVehicleAge !== undefined) {
      const vAge = vehicleAgeYears(customer.vehicleYear, asOf);
      if (vAge > rules.maxVehicleAge) {
        reasons.push(
          `Vehicle age ${vAge} years exceeds the maximum ${rules.maxVehicleAge}`,
        );
      }
    }
  }

  return { eligible: reasons.length === 0, reasons };
}
