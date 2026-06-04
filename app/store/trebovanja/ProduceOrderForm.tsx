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

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] border-collapse text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <Th>Artikal</Th>
                <Th>Jedinica</Th>
                <Th>Količina</Th>
                <Th>Smanji</Th>
                <Th>Povećaj</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const quantity = quantities[item.id] ?? 0;

                return (
                  <tr key={item.id}>
                    <td className="border-b border-slate-100 px-4 py-3 font-semibold text-ink">{item.name}</td>
                    <td className="border-b border-slate-100 px-4 py-3 text-slate-600">{item.unit}</td>
                    <td className="border-b border-slate-100 px-4 py-2">
                      <input
                        aria-label={`Količina ${item.name}`}
                        className="h-12 w-24 rounded-md border border-slate-300 px-3 text-center text-base font-semibold outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20"
                        min="0"
                        onChange={(event) => updateQuantity(item.id, Number(event.target.value))}
                        step="1"
                        type="number"
                        value={quantity}
                      />
                    </td>
                    <td className="border-b border-slate-100 px-4 py-2">
                      <button
                        aria-label={`Smanji ${item.name}`}
                        className="quantity-button"
                        onClick={() => updateQuantity(item.id, quantity - 1)}
                        type="button"
                      >
                        −
                      </button>
                    </td>
                    <td className="border-b border-slate-100 px-4 py-2">
                      <button
                        aria-label={`Povećaj ${item.name}`}
                        className="quantity-button"
                        onClick={() => updateQuantity(item.id, quantity + 1)}
                        type="button"
                      >
                        +
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-slate-200 px-4 py-3 font-bold text-slate-700">{children}</th>;
}

function ProduceSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button className="button-primary w-full sm:w-auto" disabled={disabled || pending} type="submit">
      {pending ? "Slanje..." : "Pošalji trebovanje"}
    </button>
  );
}
