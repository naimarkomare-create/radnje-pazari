"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { WriteoffList } from "@/lib/types";

type StoreOption = { id: string; name: string; biznisoft_storage_id: number | null };
type SupplierOption = { id: string; name: string; is_active: boolean };

export function PopisOtpisDrafts({
  lists,
  stores,
  suppliers
}: {
  lists: WriteoffList[];
  stores: StoreOption[];
  suppliers: SupplierOption[];
}) {
  const router = useRouter();
  const [storeId, setStoreId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function createList() {
    setMessage("");
    if (!storeId || !supplierId) {
      setMessage("Izaberite radnju i dobavljača.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/popis-otpis", {
        body: JSON.stringify({ store_id: storeId, supplier_id: supplierId }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Popis nije kreiran.");
      router.push(`/admin/popis-otpis/${data.list.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Popis nije kreiran.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Admin</p>
        <h1 className="text-2xl font-bold text-slate-950">Popis robe za otpis</h1>
        <p className="text-sm text-slate-600">Excel pripremljen za ručni uvoz u postojeći neproknjiženi BizniSoft dokument.</p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">Novi popis</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">
            Radnja
            <select className="input mt-1" value={storeId} onChange={(event) => setStoreId(event.target.value)}>
              <option value="">Izaberi radnju</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}{store.biznisoft_storage_id === null ? " · nema StorageID" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Dobavljač / kompanija
            <select className="input mt-1" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
              <option value="">Izaberi dobavljača</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
          </label>
        </div>
        <button className="button-primary mt-4 w-full sm:w-auto" disabled={busy} onClick={createList} type="button">
          {busy ? "Kreiranje..." : "Započni popis"}
        </button>
        {message ? <p className="mt-3 text-sm font-semibold text-rose-700" role="alert">{message}</p> : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-950">Sačuvani popisi</h2>
        {lists.length === 0 ? <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">Nema sačuvanih popisa.</p> : null}
        {lists.map((list) => {
          const store = Array.isArray(list.stores) ? list.stores[0] : list.stores;
          return (
            <article className="animated-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={list.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-slate-950">{list.reference}</h3>
                  <p className="text-sm text-slate-600">{store?.name ?? "Radnja"} · {list.supplier_name}</p>
                </div>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                  {list.status === "finalized" ? "Završen" : "Nacrt"}
                </span>
              </div>
              <Link className="button-secondary mt-4 w-full" href={`/admin/popis-otpis/${list.id}`}>
                {list.status === "finalized" ? "Otvori" : "Nastavi popis"}
              </Link>
            </article>
          );
        })}
      </section>
    </div>
  );
}
