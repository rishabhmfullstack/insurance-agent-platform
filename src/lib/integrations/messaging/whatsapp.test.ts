import { describe, expect, it } from "vitest";
import { buildQuoteShareMessage, waMeUrl } from "./whatsapp";

describe("waMeUrl", () => {
  it("strips non-digits from the phone and URL-encodes the message", () => {
    const url = waMeUrl("+91 98100-00001", "Hello & welcome\nline 2");
    expect(url).toBe(
      "https://wa.me/919810000001?text=Hello%20%26%20welcome%0Aline%202",
    );
  });
});

describe("buildQuoteShareMessage", () => {
  it("contains the essentials: name, product, premium, validity, review link, demo disclaimer", () => {
    const msg = buildQuoteShareMessage({
      customerName: "Aarav Sharma",
      productName: "Term Shield 50L",
      premiumDisplay: "₹8,000",
      validUntilDisplay: "18 Oct 2026",
      reviewUrl: "http://localhost:3000/review/tok123",
    });
    expect(msg).toContain("Hi Aarav Sharma");
    expect(msg).toContain("Term Shield 50L");
    expect(msg).toContain("₹8,000 / year");
    expect(msg).toContain("valid until 18 Oct 2026");
    expect(msg).toContain("http://localhost:3000/review/tok123");
    expect(msg).toContain("Demo message");
  });
});
