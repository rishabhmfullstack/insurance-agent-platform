import { renderToBuffer } from "@react-pdf/renderer";
import { randomBytes } from "crypto";
import type { Application, Customer, Product } from "@prisma/client";
import { premiumBreakdown } from "@/lib/domain/premium";
import { premiumFactorsSchema } from "@/lib/domain/rules";
import { QuotePdf, type QuotePdfData } from "./quote-template";
import { storePdf } from "./storage";

const CATEGORY_LABELS: Record<string, string> = {
  TERM: "Term Insurance",
  HEALTH: "Health Insurance",
  VEHICLE: "Vehicle Insurance",
  OTHER: "Other Insurance",
};

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const rs = (paise: bigint) => `Rs. ${inr.format(paise / 100n)}`;

export function quoteNumber(applicationId: string): string {
  return `Q-${applicationId.slice(0, 8).toUpperCase()}`;
}

/** Renders the quote PDF from the application's FROZEN data and stores it.
 * The breakdown is recomputed as of the quote's creation time, so its total
 * always equals the frozen premiumAmount (same pure function, same inputs).
 * @returns the stored PDF URL */
export async function generateAndStoreQuotePdf(
  app: Application,
  customer: Customer,
  product: Product,
): Promise<string> {
  const breakdown = premiumBreakdown(
    customer,
    product.basePremium,
    premiumFactorsSchema.parse(product.premiumFactors),
    app.createdAt,
  );

  const data: QuotePdfData = {
    quoteNumber: quoteNumber(app.id),
    createdAt: app.createdAt,
    validUntil: app.validUntil,
    customer: {
      name: customer.name,
      dobDisplay: customer.dob.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      city: customer.city,
      phone: customer.phone,
      email: customer.email,
      isSmoker: customer.isSmoker,
      vehicleDisplay: customer.ownsVehicle
        ? `Model year ${customer.vehicleYear}`
        : "None",
    },
    product: {
      name: product.name,
      categoryLabel: CATEGORY_LABELS[product.category] ?? product.category,
      description: product.description,
      coverageDisplay: rs(product.coverageAmount),
    },
    breakdown,
    premiumDisplay: rs(app.premiumAmount),
  };

  const buffer = await renderToBuffer(<QuotePdf data={data} />);
  // Random suffix: the URL is unguessable even where the app id is known.
  const filename = `quote-${app.id}-${randomBytes(4).toString("hex")}.pdf`;
  return storePdf(filename, buffer);
}
