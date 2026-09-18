import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// The enforcement-layer helper: every agent-zone page and server action starts
// here. The (agent) layout guard is UX; THIS is the security boundary, together
// with agentId-scoped queries.
export async function requireAgent() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return {
    agentId: session.user.id,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
  };
}
