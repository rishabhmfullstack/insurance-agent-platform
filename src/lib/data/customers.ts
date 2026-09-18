import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { rupeesToPaise } from "@/lib/format";
import type { CreateCustomerInput } from "@/lib/validation/customer";

// Agent-zone data access: every function takes agentId from the session and
// scopes the query with it (fetch-with-scope, never fetch-then-check).
// Wrong-owner lookups surface as notFound — no existence oracle.

export async function listCustomersForAgent(agentId: string) {
  return prisma.customer.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { applications: true } } },
  });
}

export async function getCustomerForAgent(id: string, agentId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id, agentId },
  });
  if (!customer) notFound();
  return customer;
}

export type CreateCustomerResult =
  | { ok: true; customerId: string }
  | { ok: false; error: string };

export async function createCustomerForAgent(
  agentId: string,
  input: CreateCustomerInput,
): Promise<CreateCustomerResult> {
  try {
    const customer = await prisma.customer.create({
      data: {
        agentId,
        name: input.name,
        phone: input.phone,
        email: input.email.toLowerCase(),
        dob: input.dob,
        annualIncome: rupeesToPaise(input.annualIncomeRupees),
        city: input.city,
        isSmoker: input.isSmoker,
        ownsVehicle: input.ownsVehicle,
        vehicleYear: input.ownsVehicle ? (input.vehicleYear ?? null) : null,
      },
    });
    return { ok: true, customerId: customer.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return {
        ok: false,
        error: "You already have a customer with this phone number.",
      };
    }
    throw e;
  }
}
