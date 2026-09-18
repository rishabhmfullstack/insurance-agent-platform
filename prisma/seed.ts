import { PrismaClient, ProductCategory } from "@prisma/client";
import { hashSync } from "bcryptjs";

// Idempotent seed (upserts; fixed ids for products, compound-unique upsert for
// customers). All data is FICTIONAL — documented in the README.
// Money values are BIGINT paise (₹1 = 100 paise).
const prisma = new PrismaClient();

const DEMO_AGENT = {
  name: "Demo Agent",
  email: "agent@demo.example.com", // README credential
  password: "Agent@Demo1", // README credential — demo only
};

const L = 100_000n * 100n; // ₹1 lakh in paise
const CR = 100n * L; // ₹1 crore in paise
const R = (rupees: number) => BigInt(rupees) * 100n; // whole rupees → paise

// Demo eligibility rules + premium factors (D-09: deterministic, explainable,
// NOT underwriting). minIncome is in paise.
const PRODUCTS = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    category: ProductCategory.TERM,
    name: "Term Shield 50L",
    description:
      "Pure term life cover of ₹50 lakh for the policy year. Fixed payout to the nominee.",
    coverageAmount: 50n * L,
    basePremium: R(8000),
    eligibilityRules: { minAge: 18, maxAge: 60, minIncome: Number(3n * L) },
    premiumFactors: { smokerFactor: 1.5 },
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    category: ProductCategory.TERM,
    name: "Term Shield 1Cr",
    description:
      "Pure term life cover of ₹1 crore for the policy year. Fixed payout to the nominee.",
    coverageAmount: 1n * CR,
    basePremium: R(14000),
    eligibilityRules: { minAge: 18, maxAge: 60, minIncome: Number(5n * L) },
    premiumFactors: { smokerFactor: 1.5 },
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    category: ProductCategory.HEALTH,
    name: "Health Basic 5L",
    description:
      "Hospitalization cover of ₹5 lakh including day-care procedures and ambulance.",
    coverageAmount: 5n * L,
    basePremium: R(6000),
    eligibilityRules: { minAge: 18, maxAge: 65 },
    premiumFactors: { smokerFactor: 1.5 },
  },
  {
    id: "00000000-0000-4000-8000-000000000104",
    category: ProductCategory.HEALTH,
    name: "Health Senior 3L",
    description:
      "Hospitalization cover of ₹3 lakh designed for senior citizens, with pre-existing condition waiting periods waived.",
    coverageAmount: 3n * L,
    basePremium: R(15000),
    eligibilityRules: { minAge: 60, maxAge: 75 },
    premiumFactors: { smokerFactor: 1.5 },
  },
  {
    id: "00000000-0000-4000-8000-000000000105",
    category: ProductCategory.VEHICLE,
    name: "Car Protect Comprehensive",
    description:
      "Comprehensive car insurance: own damage plus third-party liability, insured value up to ₹8 lakh.",
    coverageAmount: 8n * L,
    basePremium: R(9000),
    eligibilityRules: { minAge: 18, maxAge: 70, requiresVehicle: true, maxVehicleAge: 15 },
    premiumFactors: { vehicleAgeThreshold: 8, vehicleAgeFactor: 1.3 },
  },
  {
    id: "00000000-0000-4000-8000-000000000106",
    category: ProductCategory.VEHICLE,
    name: "Bike Protect",
    description:
      "Two-wheeler cover: own damage plus third-party liability, insured value up to ₹1.5 lakh.",
    coverageAmount: R(150000),
    basePremium: R(2500),
    eligibilityRules: { minAge: 18, maxAge: 70, requiresVehicle: true, maxVehicleAge: 15 },
    premiumFactors: { vehicleAgeThreshold: 8, vehicleAgeFactor: 1.3 },
  },
  {
    id: "00000000-0000-4000-8000-000000000107",
    category: ProductCategory.OTHER,
    name: "Travel Secure International",
    description:
      "Single-trip international travel cover of ₹10 lakh: medical emergencies, trip cancellation, lost baggage.",
    coverageAmount: 10n * L,
    basePremium: R(3000),
    eligibilityRules: { minAge: 18, maxAge: 70 },
    premiumFactors: {},
  },
];

// Engineered for eligibility contrast (docs/REQUIREMENTS.md demo-data strategy).
const CUSTOMERS = [
  {
    name: "Aarav Sharma", // 28, clean profile — eligible for almost everything
    phone: "+919810000001",
    email: "aarav.sharma@example.com",
    dob: new Date("1998-04-15"),
    annualIncome: 8n * L,
    city: "Mumbai",
    isSmoker: false,
    ownsVehicle: false,
    vehicleYear: null,
  },
  {
    name: "Meera Iyer", // 63 — health overlap band: Basic (≤65) AND Senior (≥60); term excluded by age
    phone: "+919810000002",
    email: "meera.iyer@example.com",
    dob: new Date("1963-05-20"),
    annualIncome: 6n * L,
    city: "Chennai",
    isSmoker: false,
    ownsVehicle: false,
    vehicleYear: null,
  },
  {
    name: "Rohan Verma", // 35, smoker, 2015 car — smoker loading + old-vehicle factor visible
    phone: "+919810000003",
    email: "rohan.verma@example.com",
    dob: new Date("1991-02-10"),
    annualIncome: 12n * L,
    city: "Delhi",
    isSmoker: true,
    ownsVehicle: true,
    vehicleYear: 2015,
  },
  {
    name: "Sunita Rao", // 45, income ₹2.5L — term excluded by income threshold
    phone: "+919810000004",
    email: "sunita.rao@example.com",
    dob: new Date("1981-06-25"),
    annualIncome: R(250000),
    city: "Pune",
    isSmoker: false,
    ownsVehicle: false,
    vehicleYear: null,
  },
  {
    name: "Vikram Singh", // 72 — only Health Senior; travel excluded at 72 (>70)
    phone: "+919810000005",
    email: "vikram.singh@example.com",
    dob: new Date("1954-08-01"),
    annualIncome: 4n * L,
    city: "Jaipur",
    isSmoker: false,
    ownsVehicle: false,
    vehicleYear: null,
  },
];

async function main() {
  const agent = await prisma.agent.upsert({
    where: { email: DEMO_AGENT.email },
    update: {}, // never reset the password of an existing row on re-seed
    create: {
      name: DEMO_AGENT.name,
      email: DEMO_AGENT.email,
      passwordHash: hashSync(DEMO_AGENT.password, 10),
    },
  });
  console.log(`Agent: ${agent.email}`);

  for (const p of PRODUCTS) {
    const { id, ...data } = p;
    await prisma.product.upsert({ where: { id }, update: data, create: { id, ...data } });
  }
  console.log(`Products: ${PRODUCTS.length}`);

  for (const c of CUSTOMERS) {
    await prisma.customer.upsert({
      where: { agentId_phone: { agentId: agent.id, phone: c.phone } },
      update: {},
      create: { ...c, agentId: agent.id },
    });
  }
  console.log(`Customers: ${CUSTOMERS.length}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
