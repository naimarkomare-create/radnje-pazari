"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { updateStoreDailyRevenue } from "@/app/store/actions";
import { formatMoney } from "@/components/ReportLists";
import { calculateRevenueTotal, canStoreEditRevenue, minutesUntilEditExpires, REVENUE_FIELDS, type RevenueFieldName } from "@/lib/revenue";
import type { ActionState, DailyRevenueReport } from "@/lib/types";

const initialState: ActionState = { ok: false, message: "" };

export function StoreRevenueEditList({ reports, error }: { reports: DailyRevenueReport[]; error?: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-bold text-ink">Moji pazari</h2>
      {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="mt-4 space-y-3">
        {reports.length > 0 ? (
          reports.map((report) => <StoreRevenueEditRow key={report.id} report={report} />)
        ) : (
          <p className="py-3 text-sm text-slate-500">Nema poslatih pazara.</p>
        )}
      </div>
    </section>
  );
}

function StoreRevenueEditRow({ report }: { report: DailyRevenueReport }) {
  const [state, action] = useFormState(updateStoreDailyRevenue, initialState);
  const [editing, setEditing] = useState(false);
  const remainingMinutes = minutesUntilEditExpires(report.created_at);
  const canEdit = canStoreEditRevenue(report.created_at);

  if (!editing) {
    return (
      <article className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-ink">{report.report_date}</p>
            <p className="mt-1 text-sm text-slate-600">
              {report.shift || "Bez smene"} · {formatMoney(report.total_revenue)}
            </p>
            <p className={`mt-2 text-xs font-semibold ${canEdit ? "text-leaf" : "text-red-700"}`}>
              {canEdit ? `Izmena moguća još ${remainingMinutes} minuta` : "Rok za izmenu je istekao. Kontaktirajte admina."}
            </p>
          </div>
          <button className="button-secondary" disabled={!canEdit} onClick={() => setEditing(true)} type="button">
            Izmeni pazar
          </button>
        </div>
      </article>
    );
  }

  return (
    <RevenueEditForm
      action={action}
      canEdit={canEdit}
      onCancel={() => setEditing(false)}
      report={report}
      state={state}
    />
  );
}

function RevenueEditForm({
  report,
  state,
  action,
  onCancel,
  canEdit
}: {
  report: DailyRevenueReport;
  state: ActionState;
  action: (payload: FormData) => void;
  onCancel: () => void;
  canEdit: boolean;
}) {
  const [values, setValues] = useState<Record<RevenueFieldName, number>>({
    cash_revenue: Number(report.cash_revenue) || 0,
    check_revenue: Number(report.check_revenue) || 0,
    card_revenue: Number(report.card_revenue) || 0,
    bank_transfer_revenue: Number(report.bank_transfer_revenue) || 0,
    correction_revenue: Number(report.correction_revenue) || 0,
    edopuna_revenue: Number(report.edopuna_revenue) || 0
  });
  const total = useMemo(() => calculateRevenueTotal(values), [values]);

  function updateValue(name: RevenueFieldName, value: string) {
    const nextValue = value ? Number(value) : 0;
    setValues((current) => ({ ...current, [name]: Number.isFinite(nextValue) ? nextValue : 0 }));
  }

  return (
    <form action={action} className="space-y-4 rounded-md border border-leaf/40 bg-white p-4">
      <input name="id" type="hidden" value={report.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          <span className="label">Datum</span>
          <input className="input" defaultValue={report.report_date} name="report_date" required type="date" />
        </label>
        <label className="field">
          <span className="label">Smena</span>
          <input className="input" defaultValue={report.shift ?? ""} name="shift" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
          <input className="input bg-slate-50 font-semibold" readOnly type="number" value={total} />
        </label>
      </div>
      <label className="field">
        <span className="label">Napomena</span>
        <textarea className="input min-h-20 resize-y" defaultValue={report.note ?? ""} name="note" />
      </label>
      {!canEdit ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Rok za izmenu je istekao. Kontaktirajte admina.</p> : null}
      {state.message ? (
        <p className={`rounded-md px-3 py-2 text-sm ${state.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <SaveButton disabled={!canEdit} />
        <button className="button-secondary" onClick={onCancel} type="button">
          Nazad
        </button>
      </div>
    </form>
  );
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button className="button-primary" disabled={disabled || pending} type="submit">
      {pending ? "Čuvanje..." : "Sačuvaj izmene"}
    </button>
  );
}
