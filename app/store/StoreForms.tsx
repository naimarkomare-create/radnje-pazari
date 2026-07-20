"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  submitDailyRevenue,
  submitTemperature,
  updateStoreDailyRevenue
} from "@/app/store/actions";
import { formatSerbianIsoDate } from "@/lib/date";
import {
  calculateRevenueTotal,
  canStoreEditRevenue,
  minutesUntilEditExpires,
  REVENUE_FIELDS,
  type RevenueFieldName
} from "@/lib/revenue";
import { TEMPERATURE_SLOTS } from "@/lib/temperature-slots";
import type {
  ActionState,
  DailyRevenueReport,
  TemperatureDevice
} from "@/lib/types";

const initialState: ActionState = { ok: false, message: "" };
const formClass = "space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5";

export function DailyRevenueForm({
  report,
  storeName,
  today
}: {
  report?: DailyRevenueReport;
  storeName: string;
  today: string;
}) {
  const isEditing = Boolean(report);
  const canEdit = !report || canStoreEditRevenue(report.created_at);
  const actionHandler = report
    ? updateStoreDailyRevenue
    : submitDailyRevenue;
  const [state, action] = useFormState(actionHandler, initialState);
  const [values, setValues] = useState<Record<RevenueFieldName, number>>({
    cash_revenue: Number(report?.cash_revenue) || 0,
    check_revenue: Number(report?.check_revenue) || 0,
    card_revenue: Number(report?.card_revenue) || 0,
    bank_transfer_revenue: Number(report?.bank_transfer_revenue) || 0,
    correction_revenue: Number(report?.correction_revenue) || 0,
    edopuna_revenue: Number(report?.edopuna_revenue) || 0
  });
  const total = useMemo(() => calculateRevenueTotal(values), [values]);

  function updateValue(name: RevenueFieldName, value: string) {
    const nextValue = value ? Number(value) : 0;
    setValues((current) => ({ ...current, [name]: Number.isFinite(nextValue) ? nextValue : 0 }));
  }

  return (
    <form action={action} className={formClass}>
      <div>
        <h2 className="text-lg font-bold text-ink">
          {isEditing ? "Izmeni današnji pazar" : "Unos današnjeg pazara"}
        </h2>
        {report ? (
          <p className="mt-1 text-sm text-slate-600">
            Pazar za današnji datum je već unet.
          </p>
        ) : null}
      </div>
      <ReadOnlyStore storeName={storeName} />
      {report ? <input name="id" type="hidden" value={report.id} /> : null}
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
        <p className="label">Datum</p>
        <p className="mt-1 font-semibold text-slate-950">
          {formatSerbianIsoDate(today)}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REVENUE_FIELDS.map((field) => (
          <NumberField
            disabled={!canEdit}
            key={field.name}
            label={field.label}
            name={field.name}
            onValueChange={(value) => updateValue(field.name, value)}
            value={values[field.name]}
          />
        ))}
        <label className="field">
          <span className="label">Ukupno</span>
          <input
            className="input bg-slate-50 font-semibold"
            name="total_revenue_display"
            readOnly
            type="number"
            value={total}
          />
        </label>
      </div>
      <NoteField
        defaultValue={report?.note ?? ""}
        disabled={!canEdit}
      />
      {report ? (
        <p
          className={`rounded-md px-3 py-2 text-sm font-semibold ${
            canEdit
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {canEdit
            ? `Izmena moguća još ${minutesUntilEditExpires(report.created_at)} minuta`
            : "Rok za izmenu je istekao. Kontaktirajte admina."}
        </p>
      ) : null}
      <FormMessage state={state} />
      <SubmitButton
        disabled={!canEdit}
        label={isEditing ? "Sačuvaj izmene" : "Sačuvaj pazar"}
      />
    </form>
  );
}

export function TemperatureForm({
  storeName,
  today,
  devices
}: {
  storeName: string;
  today: string;
  devices: TemperatureDevice[];
}) {
  const [state, action] = useFormState(submitTemperature, initialState);
  const [temperature, setTemperature] = useState("");

  function toggleTemperatureSign() {
    setTemperature((current) => {
      const value = current.trim();
      if (!value) return "-";
      if (value.startsWith("-")) return value.slice(1);
      if (value.startsWith("+")) return `-${value.slice(1)}`;
      return `-${value}`;
    });
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
        <select className="input" name="shift" required>
          <option value="">Izaberite smenu</option>
          {TEMPERATURE_SLOTS.map((slot) => (
            <option key={slot.value} value={slot.value}>
              {slot.label} — {slot.time}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">Naziv uređaja</span>
        <select className="input" disabled={devices.length === 0} name="device_id" required>
          <option value="">Izaberite uređaj</option>
          {devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.name}
              {device.device_type ? ` - ${device.device_type}` : ""}
            </option>
          ))}
        </select>
      </label>
      {devices.length === 0 ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Nema aktivnih uređaja. Kontaktirajte admina.
        </p>
      ) : null}
      <label className="field">
        <span className="label">Temperatura (°C)</span>
        <span className="flex min-w-0 gap-2">
          <button
            aria-label="Promeni znak temperature"
            className="h-12 w-16 shrink-0 rounded-md border border-slate-300 bg-slate-50 text-xl font-bold text-slate-800 transition-colors hover:bg-slate-100 active:scale-[0.98]"
            onClick={toggleTemperatureSign}
            type="button"
          >
            +/−
          </button>
          <input
            autoComplete="off"
            className="input min-w-0 flex-1 text-lg font-semibold"
            inputMode="decimal"
            name="temperature"
            onChange={(event) => setTemperature(event.target.value)}
            placeholder="-18,5"
            required
            type="text"
            value={temperature}
          />
        </span>
      </label>
      <NoteField />
      <FormMessage state={state} />
      <SubmitButton />
    </form>
  );
}

function SubmitButton({
  disabled = false,
  label = "Pošalji"
}: {
  disabled?: boolean;
  label?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className="button-primary w-full"
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? "Čuvanje..." : label}
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
  onValueChange,
  disabled = false
}: {
  disabled?: boolean;
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
        disabled={disabled}
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

function NoteField({
  defaultValue,
  disabled = false
}: {
  defaultValue?: string;
  disabled?: boolean;
} = {}) {
  return (
    <label className="field">
      <span className="label">Napomena</span>
      <textarea
        className="input min-h-24 resize-y"
        defaultValue={defaultValue}
        disabled={disabled}
        name="note"
      />
    </label>
  );
}
