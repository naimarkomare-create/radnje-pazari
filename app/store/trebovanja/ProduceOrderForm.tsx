"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { submitProduceRequest } from "@/app/store/actions";
import type { ActionState, ProduceItem } from "@/lib/types";

const initialState: ActionState = { ok: false, message: "" };

export function ProduceOrderForm({ items, today }: { items: ProduceItem[]; today: string }) {
  const [state, action] = useFormState(submitProduceRequest, initialState);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const selectedItems = useMemo(
    () =>
      items
        .map((item) => ({ produce_item_id: item.id, quantity: quantities[item.id] ?? 0 }))
        .filter((item) => item.quantity > 0),
    [items, quantities]
  );

  useEffect(() => {
    if (state.ok) setQuantities({});
  }, [state.ok]);

  function updateQuantity(itemId: string, nextValue: number) {
    const quantity = Number.isFinite(nextValue) ? Math.max(0, nextValue) : 0;
    setQuantities((current) => ({ ...current, [itemId]: quantity }));
  }

  return (
    <form action={action} className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <label className="field max-w-xs">
          <span className="label">Datum</span>
          <input className="input" defaultValue={today} name="request_date" required type="date" />
        </label>
        <label className="field mt-4">
          <span className="label">Napomena</span>
          <textarea className="input min-h-20 resize-y" name="note" />
        </label>
      </section>

      <input name="items" readOnly type="hidden" value={JSON.stringify(selectedItems)} />

      <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[minmax(0,1fr)_7rem_15rem] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 md:grid">
          <span>Artikal</span>
          <span>Jedinica</span>
          <span>Količina</span>
        </div>
        <div className="space-y-3 p-3 md:space-y-0 md:p-0">
          {items.map((item) => {
            const quantity = quantities[item.id] ?? 0;

            return (
              <div
                className="grid min-w-0 gap-3 rounded-md border border-slate-200 p-4 last:border-b md:grid-cols-[minmax(0,1fr)_7rem_15rem] md:items-center md:gap-4 md:rounded-none md:border-x-0 md:border-t-0"
                key={item.id}
              >
                <p className="min-w-0 break-words text-base font-bold text-ink md:text-sm">
                  {item.name}
                </p>
                <p className="text-sm text-slate-600">
                  <span className="font-semibold md:hidden">Jedinica mere: </span>
                  {item.unit}
                </p>
                <div className="min-w-0">
                  <span className="label mb-2 md:hidden">Količina</span>
                  <div className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)_3rem] gap-2">
                    <button
                      aria-label={`Smanji ${item.name}`}
                      className="quantity-button"
                      onClick={() => updateQuantity(item.id, quantity - 1)}
                      type="button"
                    >
                      −
                    </button>
                    <input
                      aria-label={`Količina ${item.name}`}
                      className="h-12 min-w-0 w-full rounded-md border border-slate-300 px-2 text-center text-base font-semibold outline-none transition focus:border-leaf focus:ring-2 focus:ring-leaf/20"
                      inputMode="numeric"
                      min="0"
                      onChange={(event) => updateQuantity(item.id, Number(event.target.value))}
                      onWheel={(event) => event.currentTarget.blur()}
                      step="1"
                      type="number"
                      value={quantity}
                    />
                    <button
                      aria-label={`Povećaj ${item.name}`}
                      className="quantity-button"
                      onClick={() => updateQuantity(item.id, quantity + 1)}
                      type="button"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {state.message ? (
        <p className={`rounded-md px-3 py-3 text-sm ${state.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {state.message}
        </p>
      ) : null}
      <ProduceSubmitButton disabled={selectedItems.length === 0} />
    </form>
  );
}

function ProduceSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button className="button-primary w-full sm:w-auto" disabled={disabled || pending} type="submit">
      {pending ? "Slanje..." : "Pošalji trebovanje"}
    </button>
  );
}
