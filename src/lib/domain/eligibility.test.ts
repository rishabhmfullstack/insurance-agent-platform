import { describe, expect, it } from "vitest";
import { evaluateEligibility } from "./eligibility";
import { ageInYears, type CustomerFacts, type EligibilityRules } from "./rules";

// Fixed evaluation date: all boundaries are exact, no clock dependence.
const AS_OF = new Date(2026, 8, 18); // 2026-09-18

/** Customer whose birthday is today → age is exactly `age`. */
function customerAged(age: number, overrides: Partial<CustomerFacts> = {}): CustomerFacts {
  return {
    dob: new Date(2026 - age, 8, 18),
    annualIncome: 800000n * 100n, // ₹8L
    isSmoker: false,
    ownsVehicle: false,
    vehicleYear: null,
    ...overrides,
  };
}

const TERM_RULES: EligibilityRules = {
  minAge: 18,
  maxAge: 60,
  minIncome: Number(300000n * 100n), // ₹3L in paise
};
const VEHICLE_RULES: EligibilityRules = {
  minAge: 18,
  maxAge: 70,
  requiresVehicle: true,
  maxVehicleAge: 15,
};

describe("ageInYears", () => {
  it("increments exactly on the birthday", () => {
    const dob = new Date(1990, 8, 18); // 1990-09-18
    expect(ageInYears(dob, new Date(2026, 8, 17))).toBe(35); // day before
    expect(ageInYears(dob, new Date(2026, 8, 18))).toBe(36); // birthday
    expect(ageInYears(dob, new Date(2026, 8, 19))).toBe(36); // day after
  });

  it("handles month boundaries", () => {
    const dob = new Date(1990, 11, 31); // 1990-12-31
    expect(ageInYears(dob, new Date(2026, 0, 1))).toBe(35);
    expect(ageInYears(dob, new Date(2026, 11, 31))).toBe(36);
  });
});

describe("evaluateEligibility — age bounds (inclusive both ends)", () => {
  it("rejects age 17, accepts 18 (min boundary)", () => {
    expect(evaluateEligibility(customerAged(17), TERM_RULES, AS_OF).eligible).toBe(false);
    expect(evaluateEligibility(customerAged(17), TERM_RULES, AS_OF).reasons[0]).toMatch(
      /Age 17 is below the minimum 18/,
    );
    expect(evaluateEligibility(customerAged(18), TERM_RULES, AS_OF).eligible).toBe(true);
  });

  it("accepts age 60, rejects 61 (max boundary)", () => {
    expect(evaluateEligibility(customerAged(60), TERM_RULES, AS_OF).eligible).toBe(true);
    const r = evaluateEligibility(customerAged(61), TERM_RULES, AS_OF);
    expect(r.eligible).toBe(false);
    expect(r.reasons[0]).toMatch(/Age 61 exceeds the maximum 60/);
  });

  it("a 60-year-old on their birthday is still 60 → eligible for max 60", () => {
    const c = customerAged(60); // birthday is exactly AS_OF
    expect(evaluateEligibility(c, TERM_RULES, AS_OF).eligible).toBe(true);
  });
});

describe("evaluateEligibility — income threshold", () => {
  it("accepts income exactly at the minimum", () => {
    const c = customerAged(30, { annualIncome: 300000n * 100n });
    expect(evaluateEligibility(c, TERM_RULES, AS_OF).eligible).toBe(true);
  });

  it("rejects income one rupee below the minimum, with a readable reason", () => {
    const c = customerAged(30, { annualIncome: 299999n * 100n });
    const r = evaluateEligibility(c, TERM_RULES, AS_OF);
    expect(r.eligible).toBe(false);
    expect(r.reasons[0]).toContain("below the minimum");
  });

  it("ignores income when the rule has no minIncome", () => {
    const c = customerAged(30, { annualIncome: 0n });
    expect(
      evaluateEligibility(c, { minAge: 18, maxAge: 65 }, AS_OF).eligible,
    ).toBe(true);
  });
});

describe("evaluateEligibility — vehicle rules", () => {
  it("rejects when no vehicle is owned", () => {
    const r = evaluateEligibility(customerAged(30), VEHICLE_RULES, AS_OF);
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain("Requires a vehicle");
  });

  it("accepts vehicle age exactly at the max (15)", () => {
    const c = customerAged(30, { ownsVehicle: true, vehicleYear: 2011 }); // 15 years
    expect(evaluateEligibility(c, VEHICLE_RULES, AS_OF).eligible).toBe(true);
  });

  it("rejects vehicle age 16 with a readable reason", () => {
    const c = customerAged(30, { ownsVehicle: true, vehicleYear: 2010 }); // 16 years
    const r = evaluateEligibility(c, VEHICLE_RULES, AS_OF);
    expect(r.eligible).toBe(false);
    expect(r.reasons[0]).toMatch(/Vehicle age 16 years exceeds the maximum 15/);
  });
});

describe("evaluateEligibility — combinations", () => {
  it("accumulates every failure reason, not just the first", () => {
    const c = customerAged(75, { annualIncome: 100000n * 100n }); // too old AND too poor for term
    const r = evaluateEligibility(c, TERM_RULES, AS_OF);
    expect(r.eligible).toBe(false);
    expect(r.reasons).toHaveLength(2);
  });

  it("overlap band: a 63-year-old qualifies for BOTH health products", () => {
    const c = customerAged(63);
    expect(evaluateEligibility(c, { minAge: 18, maxAge: 65 }, AS_OF).eligible).toBe(true); // basic
    expect(evaluateEligibility(c, { minAge: 60, maxAge: 75 }, AS_OF).eligible).toBe(true); // senior
  });

  it("a 72-year-old fails travel (max 70) but passes senior health (max 75)", () => {
    const c = customerAged(72);
    expect(evaluateEligibility(c, { minAge: 18, maxAge: 70 }, AS_OF).eligible).toBe(false);
    expect(evaluateEligibility(c, { minAge: 60, maxAge: 75 }, AS_OF).eligible).toBe(true);
  });
});
