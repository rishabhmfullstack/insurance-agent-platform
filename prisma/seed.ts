import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";

// Idempotent seed (upserts). Phase 1: demo agent only.
// Later phases add products, demo customers and sample applications.
// All data is fictional — documented in the README.
const prisma = new PrismaClient();

const DEMO_AGENT = {
  name: "Demo Agent",
  email: "agent@demo.example.com", // README credential
  password: "Agent@Demo1", // README credential — demo only, never reuse this pattern in production
};

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
  console.log(`Seeded demo agent: ${agent.email} (${agent.id})`);
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
