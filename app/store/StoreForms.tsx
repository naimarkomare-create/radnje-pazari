"use client";

import { useEffect, useState } from "react";
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
  const [values, setValues] = useState(() => Object.fromEntries(
    REVENUE_FIELDS.map(({ name }) => [name, String(Number(report?.[name]) || 0)])
  ) as Record<RevenueFieldName, string>);
  const total = calculateRevenueTotal(Object.fromEntries(
    REVENUE_FIELDS.map(({ name }) => [name, Number(values[name]) || 0])
  ) as Record<RevenueFieldName, number>);

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
          <label className="field" key={field.name}>
            <span className="label">{field.label}</span>
            <input
              className="input"
              disabled={!canEdit}
              inputMode="decimal"
              min={field.name === "correction_revenue" ? undefined : 0}
              name={field.name}
              onChange={(event) => setValues({ ...values, [field.name]: event.target.value })}
              step="0.01"
              type="number"
              value={values[field.name]}
            />
          </label>
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
  const [date, setDate] = useState(today);
  const [shift, setShift] = useState("");
  const [device, setDevice] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!state.ok) return;
    setTemperature("");
    setDate(today);
    setShift("");
    setDevice("");
    setNote("");
  }, [state, today]);

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
        <input className="input" name="report_date" onChange={(event) => setDate(event.target.value)} required type="date" value={date} />
      </label>
      <label className="field">
        <span className="label">Smena</span>
        <select className="input" name="shift" onChange={(event) => setShift(event.target.value)} required value={shift}>
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
        <select className="input" disabled={devices.length === 0} name="device_id" onChange={(event) => setDevice(event.target.value)} required value={device}>
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
      <div className="field">
        <label className="label" htmlFor="store-temperature">Temperatura (°C)</label>
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
            id="store-temperature"
            inputMode="decimal"
            name="temperature"
            onChange={(event) => setTemperature(event.target.value)}
            placeholder="-18,5"
            required
            type="text"
            value={temperature}
          />
        </span>
      </div>
      <label className="field">
        <span className="label">Napomena</span>
        <textarea className="input min-h-24 resize-y" name="note" onChange={(event) => setNote(event.target.value)} value={note} />
      </label>
      <FormMessage state={state} />
      <SubmitButton disabled={devices.length === 0} label="Sačuvaj temperaturu" />
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
    <p className={`rounded-md px-3 py-2 text-sm ${state.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`} role={state.ok ? "status" : "alert"}>
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

function NoteField({
  defaultValue,
  disabled = false
}: {
  defaultValue?: string;
  disabled?: boolean;
} = {}) {
  const [note, setNote] = useState(defaultValue ?? "");
  return (
    <label className="field">
      <span className="label">Napomena</span>
      <textarea
        className="input min-h-24 resize-y"
        disabled={disabled}
        name="note"
        onChange={(event) => setNote(event.target.value)}
        value={note}
      />
    </label>
  );
}
