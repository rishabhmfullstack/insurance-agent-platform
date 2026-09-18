import { describe, expect, it } from "vitest";
import { ageBandFactor, computePremium } from "./premium";
import type { CustomerFacts } from "./rules";

const AS_OF = new Date(2026, 8, 18); // 2026-09-18

function customerAged(age: number, overrides: Partial<CustomerFacts> = {}): CustomerFacts {
  return {
    dob: new Date(2026 - age, 8, 18), // birthday today → exact age
    annualIncome: 800000n * 100n,
    isSmoker: false,
    ownsVehicle: false,
    vehicleYear: null,
    ...overrides,
  };
}

const R = (rupees: number) => BigInt(rupees) * 100n;

describe("ageBandFactor — half-open bands, no overlap", () => {
  it.each([
    [18, 1.0],
    [30, 1.0], // upper edge of band 1
    [31, 1.3], // lower edge of band 2
    [45, 1.3],
    [46, 1.7],
    [59, 1.7], // upper edge of band 3
    [60, 2.2], // band 4 starts at 60 — the planning bug we fixed (46–60 vs 60+ overlap)
    [75, 2.2],
  ])("age %i → factor %f", (age, factor) => {
    expect(ageBandFactor(age)).toBe(factor);
  });
});

describe("computePremium", () => {
  it("base case: 28-year-old non-smoker pays exactly the base premium", () => {
    expect(computePremium(customerAged(28), R(8000), {}, AS_OF)).toBe(R(8000));
  });

  it("applies the age band: 35-year-old → base × 1.3", () => {
    expect(computePremium(customerAged(35), R(8000), {}, AS_OF)).toBe(R(10400));
  });

  it("stacks smoker factor multiplicatively: 35 + smoker → 8000 × 1.3 × 1.5", () => {
    const c = customerAged(35, { isSmoker: true });
    expect(computePremium(c, R(8000), { smokerFactor: 1.5 }, AS_OF)).toBe(R(15600));
  });

  it("non-smoker never pays the smoker factor", () => {
    expect(computePremium(customerAged(35), R(8000), { smokerFactor: 1.5 }, AS_OF)).toBe(
      R(10400),
    );
  });

  it("smoker with a product that has no smoker factor pays no loading", () => {
    const c = customerAged(28, { isSmoker: true });
    expect(computePremium(c, R(3000), {}, AS_OF)).toBe(R(3000));
  });

  it("vehicle-age factor applies only above the threshold", () => {
    const factors = { vehicleAgeThreshold: 8, vehicleAgeFactor: 1.3 };
    const oldCar = customerAged(28, { ownsVehicle: true, vehicleYear: 2015 }); // 11 yrs
    const newCar = customerAged(28, { ownsVehicle: true, vehicleYear: 2020 }); // 6 yrs
    const edgeCar = customerAged(28, { ownsVehicle: true, vehicleYear: 2018 }); // exactly 8 yrs → no factor
    expect(computePremium(oldCar, R(9000), factors, AS_OF)).toBe(R(11700));
    expect(computePremium(newCar, R(9000), factors, AS_OF)).toBe(R(9000));
    expect(computePremium(edgeCar, R(9000), factors, AS_OF)).toBe(R(9000));
  });

  it("stacks all three: 61-year-old smoker with an old car", () => {
    const c = customerAged(61, { isSmoker: true, ownsVehicle: true, vehicleYear: 2015 });
    const factors = { smokerFactor: 1.5, vehicleAgeThreshold: 8, vehicleAgeFactor: 1.3 };
    // 9000 × 2.2 × 1.5 × 1.3 = 38610 exactly
    expect(computePremium(c, R(9000), factors, AS_OF)).toBe(R(38610));
  });

  it("rounds ONCE at the end, not per factor", () => {
    // base ₹8,333, factors 1.3 × 1.5 = 1.95 → 16249.35 → ₹16,249.
    // Per-step rounding would give 8333×1.3 = 10832.9 → 10833 ×1.5 = 16249.5 → ₹16,250.
    const c = customerAged(35, { isSmoker: true });
    expect(computePremium(c, R(8333), { smokerFactor: 1.5 }, AS_OF)).toBe(R(16249));
  });

  it("always returns whole-rupee paise", () => {
    for (const age of [22, 37, 51, 68]) {
      const p = computePremium(customerAged(age, { isSmoker: true }), R(7777), { smokerFactor: 1.5 }, AS_OF);
      expect(p % 100n).toBe(0n);
      expect(p > 0n).toBe(true);
    }
  });

  it("band boundary drives the premium jump: 59 vs 60", () => {
    expect(computePremium(customerAged(59), R(10000), {}, AS_OF)).toBe(R(17000)); // ×1.7
    expect(computePremium(customerAged(60), R(10000), {}, AS_OF)).toBe(R(22000)); // ×2.2
  });
});
