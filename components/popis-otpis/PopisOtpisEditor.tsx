"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { WriteoffList, WriteoffListItem } from "@/lib/types";
import { WriteoffExportButtons } from "@/components/popis-otpis/WriteoffExportButtons";
import { ExpirationDateInput } from "@/components/popis-otpis/ExpirationDateInput";
import { formatWriteoffDate, parseWriteoffDate } from "@/lib/writeoff-date";

type Candidate = {
  article_id: number;
  article_code: string | null;
  article_name: string;
  barcode: string;
  unit: string | null;
  stock_amount: number | null;
  stock_fetched_at: string;
  price: number | null;
  suppliers: Array<{ id: string; name: string; is_primary: boolean }>;
};

export function PopisOtpisEditor({ list: initialList, initialItems }: { list: WriteoffList; initialItems: WriteoffListItem[] }) {
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [list, setList] = useState(initialList);
  const [items, setItems] = useState(initialItems);
  const [barcode, setBarcode] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [quantity, setQuantity] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [manualEntry, setManualEntry] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingQuantity, setEditingQuantity] = useState("");
  const [editingDate, setEditingDate] = useState("");
  const lookupLockRef = useRef(false);
  const lookupAbortRef = useRef<AbortController | null>(null);
  const lookupRequestRef = useRef(0);
  const saveLockRef = useRef(false);
  const clientEntryIdRef = useRef<string | null>(null);

  useEffect(() => {
    focusBarcodeInput();
    return () => lookupAbortRef.current?.abort();
  }, []);

  async function lookup(event?: React.FormEvent) {
    event?.preventDefault();
    if (!barcode.trim() || lookupBusy || lookupLockRef.current || selected || candidates.length > 0 || list.status !== "draft") return;
    const scannedValue = barcode.trim();
    setMessage("");
    setCandidates([]);
    setSelected(null);
    lookupLockRef.current = true;
    setLookupBusy(true);
    const controller = new AbortController();
    lookupAbortRef.current = controller;
    const requestId = lookupRequestRef.current + 1;
    lookupRequestRef.current = requestId;
    try {
      const response = await fetch(`/api/admin/popis-otpis/lookup?store_id=${encodeURIComponent(list.store_id)}&barcode=${encodeURIComponent(scannedValue)}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok && response.status !== 200) throw new Error(data.error ?? "Artikal nije pronađen.");
      if (requestId !== lookupRequestRef.current) return;
      if (!data.candidates?.length) throw new Error(data.error ?? `Artikal nije pronađen za barkod: ${scannedValue}`);
      setCandidates(data.candidates);
      if (data.candidates.length === 1) chooseCandidate(data.candidates[0]);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : "Artikal nije pronađen.");
    } finally {
      if (requestId === lookupRequestRef.current) {
        lookupLockRef.current = false;
        setLookupBusy(false);
        lookupAbortRef.current = null;
      }
    }
  }

  function chooseCandidate(candidate: Candidate) {
    setSelected(candidate);
    setCandidates([]);
    setQuantity("");
    setExpirationDate("");
    setTimeout(() => document.getElementById("writeoff-quantity")?.focus(), 0);
  }

  async function addItem(event?: React.FormEvent) {
    event?.preventDefault();
    if (!selected || saveBusy || saveLockRef.current || list.status !== "draft") return;
    const amount = Number(quantity.replace(",", "."));
    const isoExpirationDate = parseWriteoffDate(expirationDate);
    if (!Number.isFinite(amount) || amount <= 0 || !isoExpirationDate) {
      setMessage("Unesite količinu veću od 0 i ispravan datum isteka (DD/MM/YY).");
      return;
    }
    setMessage("");
    saveLockRef.current = true;
    const clientEntryId = clientEntryIdRef.current ?? crypto.randomUUID();
    clientEntryIdRef.current = clientEntryId;
    setSaveBusy(true);
    try {
      const response = await fetch(`/api/admin/popis-otpis/${list.id}/items`, {
        body: JSON.stringify({
          article_id: selected.article_id,
          barcode: selected.barcode,
          client_entry_id: clientEntryId,
          expiration_date: isoExpirationDate,
          quantity: amount,
          supplier_id: list.supplier_id
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Stavka nije sačuvana.");
      setItems((current) => current.some((item) => item.id === data.item.id) ? current : [...current, data.item]);
      clearSelection();
      setMessage(data.duplicate ? "Stavka je već bila sačuvana." : "Stavka je sačuvana.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Stavka nije sačuvana.");
    } finally {
      saveLockRef.current = false;
      setSaveBusy(false);
    }
  }

  function clearSelection() {
    lookupAbortRef.current?.abort();
    lookupRequestRef.current += 1;
    lookupLockRef.current = false;
    setLookupBusy(false);
    setMessage("");
    setSelected(null);
    setCandidates([]);
    setBarcode("");
    setQuantity("");
    setExpirationDate("");
    clientEntryIdRef.current = null;
    focusBarcodeInput();
  }

  function focusBarcodeInput() {
    window.setTimeout(() => {
      barcodeRef.current?.focus({ preventScroll: true });
      barcodeRef.current?.select();
    }, 0);
  }

  async function removeItem(itemId: string) {
    if (!window.confirm("Obrisati ovu stavku?")) return;
    const response = await fetch(`/api/admin/popis-otpis/${list.id}/items/${itemId}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error ?? "Stavka nije obrisana."); return; }
    setItems((current) => current.filter((item) => item.id !== itemId));
  }

  async function saveItem(itemId: string) {
    const isoExpirationDate = parseWriteoffDate(editingDate);
    if (!isoExpirationDate) { setMessage("Unesite ispravan datum isteka (DD/MM/YY)."); return; }
    const response = await fetch(`/api/admin/popis-otpis/${list.id}/items/${itemId}`, {
      body: JSON.stringify({ expiration_date: isoExpirationDate, quantity: Number(editingQuantity.replace(",", ".")) }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
    });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error ?? "Stavka nije izmenjena."); return; }
    setItems((current) => current.map((item) => item.id === itemId ? data.item : item));
    setEditingId(null);
  }

  async function finalize() {
    if (!window.confirm("Zaključati popis? Posle toga stavke više neće moći da se menjaju.")) return;
    setSaveBusy(true);
    try {
      const response = await fetch(`/api/admin/popis-otpis/${list.id}`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) setMessage(data.error ?? "Popis nije završen.");
      else setList((current) => ({ ...current, status: "finalized", finalized_at: data.list.finalized_at }));
    } catch {
      setMessage("Popis nije završen. Proverite vezu i pokušajte ponovo.");
    } finally {
      setSaveBusy(false);
    }
  }

  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity), 0);
  const finalized = list.status === "finalized";

  return (
    <div className="space-y-5">
      <Link className="text-sm font-semibold text-leaf hover:underline" href="/admin/popis-otpis">← Nazad na popise</Link>
      <header className="space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{list.reference}</p>
            <h1 className="text-2xl font-bold text-slate-950">Popis robe za otpis</h1>
            <p className="text-sm text-slate-600">{storeName(list)} · {list.supplier_name}</p>
          </div>
          <span className="rounded-md bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">{finalized ? "Završen" : "Nacrt"}</span>
        </div>
      </header>

      {!finalized ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Dodaj artikal</h2>
          <p className="mt-1 text-sm text-slate-600">Integrisani skener u režimu tastature može poslati Enter ili Tab. Skeniranje samo traži artikal; stavka se čuva tek posle količine i roka.</p>
          <form className="mt-4 space-y-3" onSubmit={lookup}>
            <label className="text-sm font-semibold text-slate-700">
              Barkod
              <input
                ref={barcodeRef}
                autoComplete="off"
                className="input mt-1 text-lg"
                enterKeyHint="search"
                inputMode={manualEntry ? "numeric" : "none"}
                onChange={(event) => setBarcode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Tab") {
                    event.preventDefault();
                    void lookup();
                  }
                }}
                value={barcode}
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="button-secondary w-full" disabled={lookupBusy} type="submit">{lookupBusy ? "Tražim..." : "Pronađi artikal"}</button>
              <button className="button-secondary w-full" onClick={() => { setManualEntry((current) => !current); focusBarcodeInput(); }} type="button">{manualEntry ? "Skener spreman" : "Unos ručno"}</button>
            </div>
            <p className="text-xs text-slate-500">Fizički skener može unositi direktno u fokusirano polje. Ručni unos uključite samo kada je potreban.</p>
          </form>

          {message && barcode && !selected && !lookupBusy ? <button className="mt-3 text-left text-sm font-semibold text-leaf hover:underline" onClick={clearSelection} type="button">Obriši unos i skeniraj ponovo</button> : null}

          {candidates.length > 1 ? (
            <div className="mt-4 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-bold text-amber-900">Barkod odgovara za više artikala. Izaberite tačan artikal:</p>
              {candidates.map((candidate) => <button className="block w-full rounded-md border border-amber-300 bg-white p-3 text-left text-sm" key={candidate.article_id} onClick={() => chooseCandidate(candidate)} type="button"><strong>{candidate.article_name}</strong><br />Šifra: {candidate.article_code ?? "-"} · ID: {candidate.article_id} · Stanje: {candidate.stock_amount ?? "-"}</button>)}
            </div>
          ) : null}

          {selected ? (
            <form className="mt-4 rounded-md border border-leaf/30 bg-emerald-50 p-4" onSubmit={addItem}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-950">{selected.article_name}</h3>
                  <p className="text-sm text-slate-700">Šifra: {selected.article_code ?? "-"} · ID: {selected.article_id}</p>
                  <p className="text-sm text-slate-700">Barkod: {selected.barcode} · Jed. mere: {selected.unit ?? "-"}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-800">Trenutno stanje: {selected.stock_amount ?? "Trenutno stanje nije dostupno"}</p>
                  <p className="text-xs text-slate-600">Preuzeto: {new Date(selected.stock_fetched_at).toLocaleString("sr-RS")}</p>
                </div>
                <button aria-label="Poništi artikal" className="button-secondary px-3" onClick={clearSelection} type="button">×</button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">Količina<input className="input mt-1 text-lg" disabled={saveBusy} id="writeoff-quantity" inputMode="decimal" min="0.001" onChange={(event) => setQuantity(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addItem(event); }} step="any" value={quantity} /></label>
                <ExpirationDateInput disabled={saveBusy} value={expirationDate} onChange={setExpirationDate} />
              </div>
              <p className="mt-3 text-sm text-slate-700">Dobavljač: <strong>{list.supplier_name}</strong></p>
              <button className="button-primary mt-4 w-full" disabled={saveBusy} type="submit">{saveBusy ? "Čuvanje..." : "Potvrdi stavku"}</button>
            </form>
          ) : null}
        </section>
      ) : null}

      {message ? <p className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700" role="status">{message}</p> : null}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-lg font-bold text-slate-950">Potvrđene stavke</h2><p className="text-sm text-slate-600">{items.length} stavki · ukupno {totalQuantity}</p></div>
          {!finalized ? <button className="button-primary" disabled={saveBusy || items.length === 0} onClick={finalize} type="button">Završi popis</button> : null}
        </div>
        <div className="mt-4 space-y-2">
          {items.length === 0 ? <p className="text-sm text-slate-600">Još nema potvrđenih stavki.</p> : null}
          {items.map((item) => (
            <article className="rounded-md border border-slate-200 p-3" key={item.id}>
              <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-950">{item.article_name}</p><p className="text-xs text-slate-600">Šifra: {item.article_code ?? "-"} · Barkod: {item.barcode} · Jed. mere: {item.unit ?? "-"}</p></div>{!finalized ? <button className="text-sm font-semibold text-rose-700" onClick={() => removeItem(item.id)} type="button">Obriši</button> : null}</div>
              {editingId === item.id ? <div className="mt-3 grid gap-2 sm:grid-cols-3"><input className="input" inputMode="decimal" value={editingQuantity} onChange={(event) => setEditingQuantity(event.target.value)} /><ExpirationDateInput value={editingDate} onChange={setEditingDate} /><button className="button-secondary" onClick={() => saveItem(item.id)} type="button">Sačuvaj</button></div> : <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-700"><span>Količina: <strong>{item.quantity}</strong> · Rok: <strong>{formatWriteoffDate(item.expiration_date)}</strong></span>{!finalized ? <button className="font-semibold text-leaf" onClick={() => { setEditingId(item.id); setEditingQuantity(String(item.quantity)); setEditingDate(formatWriteoffDate(item.expiration_date)); }} type="button">Izmeni</button> : null}</div>}
            </article>
          ))}
        </div>
        {finalized ? <WriteoffExportButtons listId={list.id} reference={list.reference} /> : null}
      </section>
    </div>
  );
}

function storeName(list: WriteoffList) {
  const store = Array.isArray(list.stores) ? list.stores[0] : list.stores;
  return store?.name ?? "Radnja";
}
