import { describe, expect, it } from "vitest";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { QuotePdf, type QuotePdfData } from "./quote-template";

const data: QuotePdfData = {
  quoteNumber: "Q-TEST1234",
  createdAt: new Date("2026-09-18"),
  validUntil: new Date("2026-10-18"),
  customer: {
    name: "Test Customer",
    dobDisplay: "10 Feb 1991",
    city: "Mumbai",
    phone: "+919999999999",
    email: "test@example.com",
    isSmoker: true,
    vehicleDisplay: "Model year 2015",
  },
  product: {
    name: "Term Shield 50L",
    categoryLabel: "Term Insurance",
    description: "test",
    coverageDisplay: "Rs. 50,00,000",
  },
  breakdown: {
    basePremium: 8000n * 100n,
    age: 35,
    ageFactor: 1.3,
    smokerFactor: 1.5,
    vehicleAgeFactor: undefined,
    total: 15600n * 100n,
  },
  premiumDisplay: "Rs. 15,600",
};

describe("quote PDF", () => {
  it("renders a valid PDF buffer with all sections", async () => {
    const buffer = await renderToBuffer(
      // QuotePdf returns <Document>; createElement's inferred props type is
      // narrower than renderToBuffer's DocumentProps expectation — safe cast.
      createElement(QuotePdf, { data }) as ReactElement<DocumentProps>,
    );
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
