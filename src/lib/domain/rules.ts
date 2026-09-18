import { z } from "zod";

// Product rule configs live as JSONB (rules-as-data, D-09). The DB cannot
// validate their shape, so they are zod-parsed at every read boundary.
// All money values inside rules are BIGINT-paise semantics stored as JSON
// numbers (safe: max values here are far below Number.MAX_SAFE_INTEGER).

export const eligibilityRulesSchema = z.object({
  minAge: z.number().int().min(0),
  maxAge: z.number().int().min(0),
  /** paise per year */
  minIncome: z.number().int().positive().optional(),
  requiresVehicle: z.boolean().optional(),
  /** whole years */
  maxVehicleAge: z.number().int().positive().optional(),
});

export const premiumFactorsSchema = z.object({
  smokerFactor: z.number().positive().optional(),
  /** vehicle older than this many years → vehicleAgeFactor applies */
  vehicleAgeThreshold: z.number().int().positive().optional(),
  vehicleAgeFactor: z.number().positive().optional(),
});

export type EligibilityRules = z.infer<typeof eligibilityRulesSchema>;
export type PremiumFactors = z.infer<typeof premiumFactorsSchema>;

/** The customer facts the rules consume — total by construction:
 * every field is required at customer creation (vehicleYear iff ownsVehicle,
 * enforced by both zod and a DB CHECK). */
export type CustomerFacts = {
  dob: Date;
  annualIncome: bigint; // paise
  isSmoker: boolean;
  ownsVehicle: boolean;
  vehicleYear: number | null;
};

/** Whole-year age as of `asOf` (age increments on the birthday). */
export function ageInYears(dob: Date, asOf: Date): number {
  let age = asOf.getFullYear() - dob.getFullYear();
  const hadBirthday =
    asOf.getMonth() > dob.getMonth() ||
    (asOf.getMonth() === dob.getMonth() && asOf.getDate() >= dob.getDate());
  if (!hadBirthday) age -= 1;
  return age;
}

/** Vehicle age in whole years by model year. */
export function vehicleAgeYears(vehicleYear: number, asOf: Date): number {
  return asOf.getFullYear() - vehicleYear;
}
