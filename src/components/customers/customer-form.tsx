"use client";

import { useActionState, useState } from "react";
import {
  createCustomerAction,
  type CustomerFormState,
} from "@/actions/customers";

const CURRENT_YEAR = new Date().getFullYear();

const inputCls =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none";
const labelCls = "block text-sm font-medium text-slate-700";

export function CustomerForm() {
  const [state, formAction, pending] = useActionState<CustomerFormState, FormData>(
    createCustomerAction,
    {},
  );
  const [ownsVehicle, setOwnsVehicle] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="name" className={labelCls}>Full name</label>
          <input id="name" name="name" type="text" required className={inputCls} />
        </div>
        <div>
          <label htmlFor="phone" className={labelCls}>Phone (WhatsApp)</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            required
            placeholder="+919876543210"
            className={inputCls}
          />
          <p className="mt-1 text-xs text-slate-500">
            Used for sharing quotes and payment links on WhatsApp.
          </p>
        </div>
        <div>
          <label htmlFor="email" className={labelCls}>Email</label>
          <input id="email" name="email" type="email" required className={inputCls} />
        </div>
        <div>
          <label htmlFor="dob" className={labelCls}>Date of birth</label>
          <input id="dob" name="dob" type="date" required className={inputCls} />
        </div>
        <div>
          <label htmlFor="annualIncomeRupees" className={labelCls}>
            Annual income (₹)
          </label>
          <input
            id="annualIncomeRupees"
            name="annualIncomeRupees"
            type="number"
            min={0}
            step={1}
            required
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="city" className={labelCls}>City</label>
          <input id="city" name="city" type="text" required className={inputCls} />
        </div>
      </div>

      <div className="flex flex-wrap gap-6 pt-1">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="isSmoker" className="h-4 w-4 rounded border-slate-300" />
          Smoker
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="ownsVehicle"
            checked={ownsVehicle}
            onChange={(e) => setOwnsVehicle(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Owns a vehicle
        </label>
      </div>

      {ownsVehicle && (
        <div className="max-w-xs">
          <label htmlFor="vehicleYear" className={labelCls}>Vehicle model year</label>
          <input
            id="vehicleYear"
            name="vehicleYear"
            type="number"
            min={1980}
            max={CURRENT_YEAR}
            required
            className={inputCls}
          />
        </div>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save customer"}
        </button>
      </div>
    </form>
  );
}
