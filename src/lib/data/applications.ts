import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

// The repository shape fixed in SECURITY-REVIEW.md: exactly two application
// fetchers. Child records (communications, payments, policy) are only ever
// loaded through one of these.

/** Agent zone: scoped fetch, notFound on wrong owner (no existence oracle). */
export async function getApplicationForAgent(id: string, agentId: string) {
  const app = await prisma.application.findFirst({
    where: { id, agentId },
    include: {
      customer: true,
      product: true,
      communications: { orderBy: { createdAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" } },
      policy: true,
    },
  });
  if (!app) notFound();
  return app;
}

/** Customer zone (capability token): minimal PII by construction — the select
 * only carries what the review page renders (customer NAME only; no dob,
 * income, phone or email). Returns null for unknown tokens; the page maps
 * that to a uniform 404. */
export async function getApplicationByToken(token: string) {
  return prisma.application.findUnique({
    where: { reviewToken: token },
    select: {
      id: true,
      status: true,
      premiumAmount: true,
      validUntil: true,
      pdfUrl: true,
      agreedAt: true,
      reviewToken: true,
      customer: { select: { name: true } },
      product: {
        select: { name: true, category: true, coverageAmount: true, description: true },
      },
      // Only the payable URL of the OPEN link crosses the token boundary.
      payments: {
        where: { status: "CREATED" },
        select: { shortUrl: true },
      },
      // Policy facts the customer should see once active.
      policy: {
        select: { policyNumber: true, startDate: true, endDate: true },
      },
    },
  });
}
