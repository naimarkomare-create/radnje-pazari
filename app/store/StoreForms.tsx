"use client";

import { useFormState, useFormStatus } from "react-dom";
import { submitDailyRevenue, submitTemperature } from "@/app/store/actions";
import { calculateRevenueTotal, REVENUE_FIELDS, type RevenueFieldName } from "@/lib/revenue";
import type { ActionState } from "@/lib/types";
import { useMemo, useState } from "react";

const initialState: ActionState = { ok: false, message: "" };
const formClass = "space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5";

export function DailyRevenueForm({ storeName, today }: { storeName: string; today: string }) {
  const [state, action] = useFormState(submitDailyRevenue, initialState);
  const [values, setValues] = useState<Record<RevenueFieldName, number>>({
    cash_revenue: 0,
    check_revenue: 0,
    card_revenue: 0,
    bank_transfer_revenue: 0,
    correction_revenue: 0,
    edopuna_revenue: 0
  });
  const total = useMemo(() => calculateRevenueTotal(values), [values]);

  function updateValue(name: RevenueFieldName, value: string) {
    const nextValue = value ? Number(value) : 0;
    setValues((current) => ({ ...current, [name]: Number.isFinite(nextValue) ? nextValue : 0 }));
  }

  return (
    <form action={action} className={formClass}>
      <ReadOnlyStore storeName={storeName} />
      <label className="field">
        <span className="label">Datum</span>
        <input className="input" defaultValue={today} name="report_date" required type="date" />
      </label>
      <label className="field">
        <span className="label">Smena</span>
        <input className="input" name="shift" placeholder="Prva / druga" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REVENUE_FIELDS.map((field) => (
          <NumberField
            key={field.name}
            label={field.label}
            name={field.name}
            onValueChange={(value) => updateValue(field.name, value)}
            value={values[field.name]}
          />
        ))}
        <label className="field">
          <span className="label">Ukupno</span>
          <input className="input bg-slate-50 font-semibold" name="total_revenue_display" readOnly type="number" value={total} />
        </label>
      </div>
      <NoteField />
      <FormMessage state={state} />
      <SubmitButton />
    </form>
  );
}

export function TemperatureForm({ storeName, today }: { storeName: string; today: string }) {
  const [state, action] = useFormState(submitTemperature, initialState);

  return (
    <form action={action} className={formClass}>
      <ReadOnlyStore storeName={storeName} />
      <label className="field">
        <span className="label">Datum</span>
        <input className="input" defaultValue={today} name="report_date" required type="date" />
      </label>
      <label className="field">
        <span className="label">Naziv uređaja</span>
        <input className="input" name="device_name" required />
      </label>
      <NumberField label="Temperatura" name="temperature" required step="0.1" />
      <NoteField />
      <FormMessage state={state} />
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="button-primary w-full" disabled={pending} type="submit">
      {pending ? "Slanje..." : "Pošalji"}
    </button>
  );
}

function FormMessage({ state }: { state: ActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p className={`rounded-md px-3 py-2 text-sm ${state.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
      {state.message}
    </p>
  );
}

function ReadOnlyStore({ storeName }: { storeName: string }) {
  return (
    <label className="field">
      <span className="label">Radnja</span>
      <input className="input bg-slate-50" readOnly value={storeName} />
    </label>
  );
}

function NumberField({
  label,
  name,
  required = false,
  step = "0.01",
  value,
  onValueChange
}: {
  label: string;
  name: string;
  required?: boolean;
  step?: string;
  value?: number;
  onValueChange?: (value: string) => void;
}) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input
        className="input"
        defaultValue={onValueChange ? undefined : 0}
        min={label === "Temperatura" || name === "correction_revenue" ? undefined : 0}
        name={name}
        onChange={onValueChange ? (event) => onValueChange(event.target.value) : undefined}
        required={required}
        step={step}
        type="number"
        value={onValueChange ? value : undefined}
      />
    </label>
  );
}

function NoteField() {
  return (
    <label className="field">
      <span className="label">Napomena</span>
      <textarea className="input min-h-24 resize-y" name="note" />
    </label>
  );
}
