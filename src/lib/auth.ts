import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db";
import { loginSchema } from "@/lib/validation/auth";
import { config } from "@/lib/config";

// Zone 1 authentication (docs/ARCHITECTURE.md): Auth.js credentials provider,
// JWT session strategy (required for credentials), httpOnly cookie.
// Authorization is NOT done here — every query scopes by agentId (session.ts).
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: config.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();
        const agent = await prisma.agent.findUnique({ where: { email } });
        // Generic failure either way — never reveal which part was wrong.
        if (!agent) return null;

        const passwordOk = await compare(parsed.data.password, agent.passwordHash);
        if (!passwordOk) return null;

        return { id: agent.id, name: agent.name, email: agent.email };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.agentId = user.id;
      return token;
    },
    session({ session, token }) {
      if (typeof token.agentId === "string") session.user.id = token.agentId;
      return session;
    },
  },
});
