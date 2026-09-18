"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAgent } from "@/lib/session";
import { createCustomerSchema } from "@/lib/validation/customer";
import { createCustomerForAgent } from "@/lib/data/customers";

export type CustomerFormState = { error?: string };

// Thin orchestration per ARCHITECTURE.md: validate → authenticate → domain/data
// call → revalidate/redirect. Checkbox fields arrive as "on"/null from
// FormData and are normalized to booleans before zod.
export async function createCustomerAction(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const { agentId } = await requireAgent();

  const raw = Object.fromEntries(formData);
  const parsed = createCustomerSchema.safeParse({
    ...raw,
    isSmoker: raw.isSmoker === "on",
    ownsVehicle: raw.ownsVehicle === "on",
    vehicleYear:
      raw.ownsVehicle === "on" && raw.vehicleYear !== "" ? raw.vehicleYear : undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await createCustomerForAgent(agentId, parsed.data);
  if (!result.ok) return { error: result.error };

  revalidatePath("/dashboard");
  redirect(`/customers/${result.customerId}`);
}
