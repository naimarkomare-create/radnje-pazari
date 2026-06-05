"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { updateAdminDailyRevenue } from "@/app/admin/ispravka-pazara/actions";
import { calculateRevenueTotal, REVENUE_FIELDS, type RevenueFieldName } from "@/lib/revenue";
import type { ActionState, DailyRevenueReport } from "@/lib/types";

const initialState: ActionState = { ok: false, message: "" };

export function RevenueCorrectionTable({ reports, error }: { reports: DailyRevenueReport[]; error?: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-bold text-ink">Ispravka pazara</h2>
      {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="mt-4 space-y-4">
        {reports.length > 0 ? (
          reports.map((report) => <RevenueCorrectionRow key={report.id} report={report} />)
        ) : (
          <p className="py-3 text-sm text-slate-500">Nema pazara za izabrane filtere.</p>
        )}
      </div>
    </section>
  );
}

function RevenueCorrectionRow({ report }: { report: DailyRevenueReport }) {
  const [state, action] = useFormState(updateAdminDailyRevenue, initialState);
  const [values, setValues] = useState<Record<RevenueFieldName, number>>({
    cash_revenue: Number(report.cash_revenue) || 0,
    check_revenue: Number(report.check_revenue) || 0,
    card_revenue: Number(report.card_revenue) || 0,
    bank_transfer_revenue: Number(report.bank_transfer_revenue) || 0,
    correction_revenue: Number(report.correction_revenue) || 0,
    edopuna_revenue: Number(report.edopuna_revenue) || 0
  });
  const [total, setTotal] = useState(Number(report.total_revenue) || 0);

  function updateValue(name: RevenueFieldName, value: string) {
    const nextValue = value ? Number(value) : 0;
    setValues((current) => {
      const nextValues = { ...current, [name]: Number.isFinite(nextValue) ? nextValue : 0 };
      setTotal(calculateRevenueTotal(nextValues));
      return nextValues;
    });
  }

  return (
    <form action={action} className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-4">
      <input name="id" type="hidden" value={report.id} />
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-bold text-ink">{report.stores?.name ?? "Radnja"}</p>
          <p className="text-sm text-slate-600">{report.report_date}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="field">
          <span className="label">Datum</span>
          <input className="input" defaultValue={report.report_date} name="report_date" required type="date" />
        </label>
        <label className="field">
          <span className="label">Smena</span>
          <input className="input" defaultValue={report.shift ?? ""} name="shift" />
        </label>
        {REVENUE_FIELDS.map((field) => (
          <label className="field" key={field.name}>
            <span className="label">{field.label}</span>
            <input
              className="input"
              min={field.name === "correction_revenue" ? undefined : "0"}
              name={field.name}
              onChange={(event) => updateValue(field.name, event.target.value)}
              step="0.01"
              type="number"
              value={values[field.name]}
            />
          </label>
        ))}
        <label className="field">
          <span className="label">Ukupno</span>
          <input
            className="input bg-white font-semibold"
            name="total_revenue"
            onChange={(event) => setTotal(event.target.value ? Number(event.target.value) : 0)}
            step="0.01"
            type="number"
            value={total}
          />
        </label>
      </div>
      <label className="field">
        <span className="label">Napomena</span>
        <textarea className="input min-h-20 resize-y" defaultValue={report.note ?? ""} name="note" />
      </label>
      {state.message ? (
        <p className={`rounded-md px-3 py-2 text-sm ${state.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {state.message}
        </p>
      ) : null}
      <SaveButton />
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button className="button-primary w-full sm:w-auto" disabled={pending} type="submit">
      {pending ? "Čuvanje..." : "Sačuvaj izmene"}
    </button>
  );
}
