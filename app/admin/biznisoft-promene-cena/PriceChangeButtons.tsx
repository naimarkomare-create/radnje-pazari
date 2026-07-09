"use client";

import { useState, useTransition } from "react";
import {
  createPriceChangeTasksForAllPending,
  createPriceChangeTasksForGroup,
  ignorePriceChangeGroup
} from "@/app/admin/biznisoft-promene-cena/actions";

type ButtonState = {
  ok: boolean;
  message: string;
} | null;

export function PriceSyncButton() {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ButtonState>(null);

  return (
    <div className="space-y-2">
      <button
        className="button-primary w-full sm:w-auto"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setState(null);
            try {
              const response = await fetch("/api/admin/biznisoft/sync-stock-prices", { method: "POST" });
              const data = await response.json();

              if (!response.ok) {
                setState({ ok: false, message: data.error ?? "Sinhronizacija nije uspela." });
                return;
              }

              setState({
                ok: true,
                message: `Provereno radnji: ${data.stores_checked}. Učitano stavki: ${data.rows_fetched_total}. Snapshot: ${data.snapshot_rows_inserted}. Nove promene: ${data.price_changes_created}. Baseline: ${data.baseline_rows_inserted}.`
              });
            } catch (error) {
              setState({ ok: false, message: error instanceof Error ? error.message : "Sinhronizacija nije uspela." });
            }
          })
        }
        type="button"
      >
        {pending ? "Sinhronizacija..." : "Sinhronizuj cene sada"}
      </button>
      {state ? <p className={state.ok ? "text-sm font-medium text-green-700" : "text-sm font-medium text-red-700"}>{state.message}</p> : null}
    </div>
  );
}

export function BulkTaskButton() {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ButtonState>(null);

  return (
    <div className="space-y-2">
      <button
        className="button-secondary w-full sm:w-auto"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await createPriceChangeTasksForAllPending();
            setState(result);
          })
        }
        type="button"
      >
        {pending ? "Kreiranje..." : "Napravi zadatke za sve nepotvrđene"}
      </button>
      {state ? <p className={state.ok ? "text-sm font-medium text-green-700" : "text-sm font-medium text-red-700"}>{state.message}</p> : null}
    </div>
  );
}

export function GroupTaskButton({ changeDate, storageKey }: { changeDate: string; storageKey: string }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ButtonState>(null);

  return (
    <div className="space-y-2">
      <button
        className="button-primary w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await createPriceChangeTasksForGroup(storageKey, changeDate);
            setState(result);
          })
        }
        type="button"
      >
        {pending ? "Kreiranje..." : "Napravi zadatak"}
      </button>
      {state ? <p className={state.ok ? "text-xs font-medium text-green-700" : "text-xs font-medium text-red-700"}>{state.message}</p> : null}
    </div>
  );
}

export function DetailTaskButtons({ changeDate, storageKey }: { changeDate: string; storageKey: string }) {
  const [taskPending, startTaskTransition] = useTransition();
  const [ignorePending, startIgnoreTransition] = useTransition();
  const [state, setState] = useState<ButtonState>(null);

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          className="button-primary"
          disabled={taskPending || ignorePending}
          onClick={() =>
            startTaskTransition(async () => {
              const result = await createPriceChangeTasksForGroup(storageKey, changeDate);
              setState(result);
            })
          }
          type="button"
        >
          {taskPending ? "Kreiranje..." : "Napravi zadatak za ovu radnju"}
        </button>
        <button
          className="button-secondary"
          disabled={taskPending || ignorePending}
          onClick={() =>
            startIgnoreTransition(async () => {
              const result = await ignorePriceChangeGroup(storageKey, changeDate);
              setState(result);
            })
          }
          type="button"
        >
          {ignorePending ? "Čuvanje..." : "Označi kao ignorisano"}
        </button>
      </div>
      {state ? <p className={state.ok ? "text-sm font-medium text-green-700" : "text-sm font-medium text-red-700"}>{state.message}</p> : null}
    </div>
  );
}
