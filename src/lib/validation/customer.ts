import { z } from "zod";

const CURRENT_YEAR = new Date().getFullYear();

// Every field the rules/PDF consume is REQUIRED here (vehicleYear iff
// ownsVehicle) so the eligibility evaluator is total — mirrored by the DB
// CHECK cust_vehicle_year_required.
export const createCustomerSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters"),
    phone: z
      .string()
      .trim()
      .regex(
        /^\+?[1-9][0-9]{9,14}$/,
        "Enter the WhatsApp number in international format, e.g. +919876543210",
      ),
    email: z.email("Enter a valid email address"),
    dob: z.coerce
      .date("Enter a valid date of birth")
      .refine((d) => d < new Date(), "Date of birth must be in the past")
      .refine(
        (d) => d > new Date(CURRENT_YEAR - 120, 0, 1),
        "Date of birth is unrealistically old",
      ),
    annualIncomeRupees: z.coerce
      .number("Enter annual income in rupees")
      .int("Annual income must be a whole number of rupees")
      .min(0, "Annual income cannot be negative")
      .max(1_000_000_000, "Annual income is unrealistically high"),
    city: z.string().trim().min(2, "City is required"),
    isSmoker: z.boolean(),
    ownsVehicle: z.boolean(),
    vehicleYear: z.coerce
      .number()
      .int()
      .min(1980, "Vehicle year must be 1980 or later")
      .max(CURRENT_YEAR, `Vehicle year cannot be after ${CURRENT_YEAR}`)
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.ownsVehicle && data.vehicleYear === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["vehicleYear"],
        message: "Vehicle year is required when the customer owns a vehicle",
      });
    }
  });

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
