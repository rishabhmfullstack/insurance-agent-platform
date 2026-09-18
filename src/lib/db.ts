import { PrismaClient } from "@prisma/client";

// Singleton: avoids exhausting connections under Next.js dev hot-reload and
// serverless re-invocation.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
