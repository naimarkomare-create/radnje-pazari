"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { createStoreTask } from "@/app/admin/zadaci/actions";
import { TASK_PRIORITIES, taskPriorityLabel } from "@/lib/tasks";
import type { ActionState, Store } from "@/lib/types";

const initialState: ActionState = { ok: false, message: "" };

export function AdminTaskForm({ stores, today }: { stores: Store[]; today: string }) {
  const [state, formAction] = useFormState(createStoreTask, initialState);
  const [allStores, setAllStores] = useState(true);

  return (
    <section className="interactive-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-bold text-ink">Novi zadatak</h2>
      <form action={formAction} className="mt-4 space-y-4">
        <fieldset className="space-y-3">
          <legend className="label">Radnje</legend>
          <label className="flex items-center gap-3 rounded-md bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">
            <input checked={allStores} name="all_stores" onChange={(event) => setAllStores(event.target.checked)} type="checkbox" />
            Sve radnje
          </label>
          {!allStores ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {stores.map((store) => (
                <label className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700" key={store.id}>
                  <input name="store_ids" type="checkbox" value={store.id} />
                  {store.name}
                </label>
              ))}
            </div>
          ) : null}
        </fieldset>

        <label className="field">
          <span className="label">Naslov zadatka</span>
          <input className="input" name="title" required />
        </label>

        <label className="field">
          <span className="label">Opis</span>
          <textarea className="input min-h-24 resize-y" name="description" />
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="field">
            <span className="label">Rok datum</span>
            <input className="input" defaultValue={today} name="due_date" required type="date" />
          </label>
          <label className="field">
            <span className="label">Rok vreme</span>
            <input className="input" name="due_time" type="time" />
          </label>
          <label className="field">
            <span className="label">Oznaka</span>
            <select className="input" defaultValue="podsetnik" name="priority">
              {TASK_PRIORITIES.map((priority) => (
                <option key={priority.value} value={priority.value}>
                  {taskPriorityLabel(priority.value)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex items-center gap-3 rounded-md bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">
          <input name="photo_required" type="checkbox" />
          Slika obavezna
        </label>

        {state.message ? (
          <p className={`rounded-md px-3 py-3 text-sm ${state.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {state.message}
          </p>
        ) : null}

        <button className="button-primary w-full sm:w-auto" type="submit">
          Pošalji zadatak
        </button>
      </form>
    </section>
  );
}
