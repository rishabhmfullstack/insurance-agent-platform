import { prisma } from "@/lib/db";
import {
  eligibilityRulesSchema,
  premiumFactorsSchema,
  type EligibilityRules,
  type PremiumFactors,
} from "@/lib/domain/rules";
import type { Product } from "@prisma/client";

// Products are global catalogue data (seeded, immutable in MVP) — no agent
// scoping. JSONB rule configs are zod-parsed at this read boundary so the rest
// of the app only ever sees typed rules.

export type ProductWithRules = Product & {
  rules: EligibilityRules;
  factors: PremiumFactors;
};

export function parseProduct(product: Product): ProductWithRules {
  return {
    ...product,
    rules: eligibilityRulesSchema.parse(product.eligibilityRules),
    factors: premiumFactorsSchema.parse(product.premiumFactors),
  };
}

const CATEGORY_ORDER = ["TERM", "HEALTH", "VEHICLE", "OTHER"] as const;

export async function listProducts(): Promise<ProductWithRules[]> {
  const products = await prisma.product.findMany({
    orderBy: [{ category: "asc" }, { basePremium: "asc" }],
  });
  return products
    .map(parseProduct)
    .sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
    );
}

/** Plain-words criteria for the catalogue (shown so later eligibility results
 * feel explainable, not magical). */
export function describeRules(rules: EligibilityRules): string[] {
  const parts: string[] = [`Ages ${rules.minAge}–${rules.maxAge}`];
  if (rules.minIncome !== undefined) {
    const lakh = rules.minIncome / 100 / 100000;
    parts.push(`Annual income ≥ ₹${lakh}L`);
  }
  if (rules.requiresVehicle) {
    parts.push(
      rules.maxVehicleAge !== undefined
        ? `Requires a vehicle (≤ ${rules.maxVehicleAge} years old)`
        : "Requires a vehicle",
    );
  }
  return parts;
}
