"use client";

import { useFormState, useFormStatus } from "react-dom";
import { submitDailyRevenue, submitProduceRequest, submitTemperature } from "@/app/store/actions";
import type { ActionState } from "@/lib/types";

const initialState: ActionState = { ok: false, message: "" };
const formClass = "space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5";

export function DailyRevenueForm({ storeName, today }: { storeName: string; today: string }) {
  const [state, action] = useFormState(submitDailyRevenue, initialState);

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
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField label="Gotovina" name="cash_revenue" required />
        <NumberField label="Kartica" name="card_revenue" required />
        <NumberField label="Ukupno" name="total_revenue" required />
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

export function ProduceRequestForm({ storeName, today }: { storeName: string; today: string }) {
  const [state, action] = useFormState(submitProduceRequest, initialState);

  return (
    <form action={action} className={formClass}>
      <ReadOnlyStore storeName={storeName} />
      <label className="field">
        <span className="label">Datum</span>
        <input className="input" defaultValue={today} name="request_date" required type="date" />
      </label>
      <label className="field">
        <span className="label">Naziv artikla</span>
        <input className="input" name="item_name" required />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField label="Količina" name="quantity" />
        <label className="field">
          <span className="label">Jedinica mere</span>
          <input className="input" name="unit" placeholder="kg, gajba, kom" />
        </label>
      </div>
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
  step = "0.01"
}: {
  label: string;
  name: string;
  required?: boolean;
  step?: string;
}) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input
        className="input"
        min={label === "Temperatura" ? undefined : 0}
        name={name}
        required={required}
        step={step}
        type="number"
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
