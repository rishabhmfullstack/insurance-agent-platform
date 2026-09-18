import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { PremiumBreakdown } from "@/lib/domain/premium";

// One-page personalized quote (D-08). Rendered once at quote creation from
// FROZEN data — the PDF can never disagree with the review page or the
// payment amount. NOTE: the standard PDF fonts (Helvetica) cannot encode the
// "₹" glyph (U+20B9), so money renders as "Rs." — a deliberate trade over
// bundling a font file.

export type QuotePdfData = {
  quoteNumber: string;
  createdAt: Date;
  validUntil: Date;
  customer: {
    name: string;
    dobDisplay: string;
    city: string;
    phone: string;
    email: string;
    isSmoker: boolean;
    vehicleDisplay: string; // "None" | "Model year 2015"
  };
  product: {
    name: string;
    categoryLabel: string;
    description: string;
    coverageDisplay: string; // "Rs. 50,00,000"
  };
  breakdown: PremiumBreakdown;
  premiumDisplay: string; // "Rs. 15,600"
};

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const rs = (paise: bigint) => `Rs. ${inr.format(paise / 100n)}`;
const dateStr = (d: Date) =>
  d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

const s = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: "Helvetica", color: "#1e293b" },
  brand: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  tagline: { fontSize: 9, color: "#64748b", marginTop: 2 },
  banner: {
    marginTop: 10,
    padding: 6,
    backgroundColor: "#fef3c7",
    fontSize: 8,
    color: "#92400e",
  },
  headerRow: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  h2: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 18,
    marginBottom: 6,
    color: "#0f172a",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
  },
  label: { color: "#64748b" },
  value: { fontFamily: "Helvetica-Bold" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#0f172a",
  },
  totalText: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  term: { marginBottom: 3, color: "#334155" },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 48,
    right: 48,
    fontSize: 8,
    color: "#94a3b8",
    textAlign: "center",
  },
});

export function QuotePdf({ data }: { data: QuotePdfData }) {
  const b = data.breakdown;
  return (
    <Document title={`Insurance Quote ${data.quoteNumber}`}>
      <Page size="A4" style={s.page}>
        <Text style={s.brand}>Insurance Agent Platform</Text>
        <Text style={s.tagline}>Personalized Insurance Quote</Text>
        <Text style={s.banner}>
          DEMONSTRATION DOCUMENT — this is not a real insurance offer, policy or
          contract. All data is fictional.
        </Text>

        <View style={s.headerRow}>
          <View>
            <Text style={s.label}>Quote number</Text>
            <Text style={s.value}>{data.quoteNumber}</Text>
          </View>
          <View>
            <Text style={s.label}>Quote date</Text>
            <Text style={s.value}>{dateStr(data.createdAt)}</Text>
          </View>
          <View>
            <Text style={s.label}>Valid until</Text>
            <Text style={s.value}>{dateStr(data.validUntil)}</Text>
          </View>
        </View>

        <Text style={s.h2}>Customer</Text>
        {(
          [
            ["Name", data.customer.name],
            ["Date of birth", data.customer.dobDisplay],
            ["City", data.customer.city],
            ["Phone", data.customer.phone],
            ["Email", data.customer.email],
            ["Smoker", data.customer.isSmoker ? "Yes" : "No"],
            ["Vehicle", data.customer.vehicleDisplay],
          ] as const
        ).map(([k, v]) => (
          <View key={k} style={s.row}>
            <Text style={s.label}>{k}</Text>
            <Text>{v}</Text>
          </View>
        ))}

        <Text style={s.h2}>Product</Text>
        <View style={s.row}>
          <Text style={s.label}>Plan</Text>
          <Text style={s.value}>{data.product.name}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Category</Text>
          <Text>{data.product.categoryLabel}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Coverage</Text>
          <Text style={s.value}>{data.product.coverageDisplay}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Policy term</Text>
          <Text>1 year, single annual payment</Text>
        </View>

        <Text style={s.h2}>Premium calculation</Text>
        <View style={s.row}>
          <Text style={s.label}>Base premium</Text>
          <Text>{rs(b.basePremium)}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Age factor (age {b.age})</Text>
          <Text>x {b.ageFactor.toFixed(2)}</Text>
        </View>
        {b.smokerFactor !== undefined && (
          <View style={s.row}>
            <Text style={s.label}>Smoker factor</Text>
            <Text>x {b.smokerFactor.toFixed(2)}</Text>
          </View>
        )}
        {b.vehicleAgeFactor !== undefined && (
          <View style={s.row}>
            <Text style={s.label}>Vehicle age factor</Text>
            <Text>x {b.vehicleAgeFactor.toFixed(2)}</Text>
          </View>
        )}
        <View style={s.totalRow}>
          <Text style={s.totalText}>Annual premium</Text>
          <Text style={s.totalText}>{data.premiumDisplay}</Text>
        </View>

        <Text style={s.h2}>Key terms (demo)</Text>
        <Text style={s.term}>
          - This quote is valid until {dateStr(data.validUntil)}; premiums are
          fixed for the quoted policy year.
        </Text>
        <Text style={s.term}>
          - Coverage begins only after payment is verified and the policy is
          issued.
        </Text>
        <Text style={s.term}>
          - Eligibility and premium are computed from the customer details
          listed above; demo rules, not real underwriting.
        </Text>
        <Text style={s.term}>
          - Agreeing to this quote online records your consent with a
          timestamp; no signature is collected in this demo.
        </Text>

        <Text style={s.footer}>
          Insurance Agent Platform (demo MVP) - Quote {data.quoteNumber} - Not a
          real insurance document
        </Text>
      </Page>
    </Document>
  );
}
