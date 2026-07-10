"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BarcodeScanner } from "@/components/povrati/BarcodeScanner";
import type { ArticleLookupItem, ReturnProposal, ReturnProposalItem } from "@/lib/types";

const reasons = ["Oštećeno", "Istek roka", "Višak", "Pogrešna isporuka", "Drugo"];

export function ReturnProposalApp({ initialProposals }: { initialProposals: ReturnProposal[] }) {
  const [proposals, setProposals] = useState(initialProposals);
  const [activeProposal, setActiveProposal] = useState<ReturnProposal | null>(initialProposals[0] ?? null);
  const [selectedArticle, setSelectedArticle] = useState<ArticleLookupItem | null>(null);
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [results, setResults] = useState<ArticleLookupItem[]>([]);
  const [manual, setManual] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editNote, setEditNote] = useState("");
  const quantityInputRef = useRef<HTMLInputElement | null>(null);
  const scannerLockedRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editable = activeProposal ? ["draft", "submitted"].includes(activeProposal.status) : false;
  const scannerLocked = Boolean(selectedArticle || scannedBarcode || lookupLoading);
  const items = useMemo(() => activeProposal?.return_proposal_items ?? [], [activeProposal]);

  scannerLockedRef.current = scannerLocked;

  useEffect(() => {
    if (!activeProposal && proposals.length > 0) setActiveProposal(proposals[0]);
  }, [activeProposal, proposals]);

  useEffect(() => {
    if (selectedArticle) {
      setTimeout(() => quantityInputRef.current?.focus(), 50);
    }
  }, [selectedArticle]);

  async function createProposal() {
    setError(null);
    const response = await fetch("/api/return-proposals", {
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Najava nije kreirana.");
      return;
    }

    setProposals((current) => [data.proposal, ...current]);
    setActiveProposal(data.proposal);
    setMessage("Nova najava je otvorena.");
  }

  async function openProposal(id: string) {
    setError(null);
    const response = await fetch(`/api/return-proposals/${id}`);
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Najava nije učitana.");
      return;
    }

    setActiveProposal(data.proposal);
    clearScannedArticle();
  }

  async function handleDetectedBarcode(barcode: string) {
    if (scannerLockedRef.current) return;

    scannerLockedRef.current = true;
    setScannedBarcode(barcode);
    setLookupLoading(true);
    setLookupError("");
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/articles/lookup?barcode=${encodeURIComponent(barcode)}`);
      const data = await response.json();

      if (!response.ok) {
        setLookupError(data.error ?? "Pretraga nije uspela.");
        return;
      }

      applyLookupResult(normalizeLookupItems(data), barcode);
    } catch {
      setLookupError("Pretraga nije uspela.");
    } finally {
      setLookupLoading(false);
    }
  }

  async function manualSearch() {
    const value = manual.trim();
    if (!value || scannerLockedRef.current) return;

    scannerLockedRef.current = true;
    const params = /^\d+$/.test(value) ? `article_id=${encodeURIComponent(value)}` : `q=${encodeURIComponent(value)}`;
    setScannedBarcode(value);
    setLookupLoading(true);
    setLookupError("");
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/articles/lookup?${params}`);
      const data = await response.json();

      if (!response.ok) {
        setLookupError(data.error ?? "Pretraga nije uspela.");
        return;
      }

      applyLookupResult(normalizeLookupItems(data), value);
    } catch {
      setLookupError("Pretraga nije uspela.");
    } finally {
      setLookupLoading(false);
    }
  }

  function applyLookupResult(lookupItems: ArticleLookupItem[], searchedValue: string) {
    setResults(lookupItems);

    if (lookupItems.length === 1) {
      setSelectedArticle(lookupItems[0]);
      setQuantity("");
      setLookupError("");
      return;
    }

    if (lookupItems.length === 0) {
      setSelectedArticle(null);
      setLookupError(`Artikal nije pronađen za barkod: ${searchedValue}`);
    }
  }

  function selectArticle(article: ArticleLookupItem) {
    setSelectedArticle(article);
    setLookupError("");
    setQuantity("");
  }

  function clearScannedArticle() {
    scannerLockedRef.current = false;
    setSelectedArticle(null);
    setScannedBarcode("");
    setQuantity("");
    setLookupError("");
    setLookupLoading(false);
    setResults([]);
    setReason("");
    setNote("");
  }

  async function addItem() {
    if (!activeProposal || !selectedArticle) return;

    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError("Unesite količinu veću od 0.");
      return;
    }

    setError(null);
    const response = await fetch(`/api/return-proposals/${activeProposal.id}/items`, {
      body: JSON.stringify({
        article_id: selectedArticle.article_id,
        article_name: selectedArticle.name,
        barcode: selectedArticle.barcode,
        note,
        quantity: parsedQuantity,
        raw_article: selectedArticle.raw ?? {},
        reason,
        unit: selectedArticle.unit
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Artikal nije dodat.");
      return;
    }

    const nextProposal = {
      ...activeProposal,
      return_proposal_items: [data.item, ...(activeProposal.return_proposal_items ?? [])],
      updated_at: new Date().toISOString()
    };

    setActiveProposal(nextProposal);
    setProposals((current) => current.map((proposal) => (proposal.id === nextProposal.id ? nextProposal : proposal)));
    setMessage(`Dodato: ${selectedArticle.name} x ${parsedQuantity}`);
    clearScannedArticle();
    setManual("");
  }

  async function deleteItem(item: ReturnProposalItem) {
    if (!activeProposal) return;
    const response = await fetch(`/api/return-proposals/${activeProposal.id}/items/${item.id}`, { method: "DELETE" });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Stavka nije obrisana.");
      return;
    }

    setActiveProposal({
      ...activeProposal,
      return_proposal_items: items.filter((current) => current.id !== item.id),
      updated_at: new Date().toISOString()
    });
    setMessage("Stavka je obrisana.");
  }

  function startEdit(item: ReturnProposalItem) {
    setEditingItemId(item.id);
    setEditQuantity(String(item.quantity));
    setEditReason(item.reason ?? "");
    setEditNote(item.note ?? "");
  }

  async function saveItem(item: ReturnProposalItem) {
    if (!activeProposal) return;

    const parsedQuantity = Number(editQuantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError("Količina mora biti veća od 0.");
      return;
    }

    const response = await fetch(`/api/return-proposals/${activeProposal.id}/items/${item.id}`, {
      body: JSON.stringify({
        note: editNote,
        quantity: parsedQuantity,
        reason: editReason
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Stavka nije izmenjena.");
      return;
    }

    setActiveProposal({
      ...activeProposal,
      return_proposal_items: items.map((current) => (current.id === item.id ? data.item : current)),
      updated_at: new Date().toISOString()
    });
    setEditingItemId(null);
    setMessage("Stavka je izmenjena.");
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">Najava povrata</h1>
            <p className="text-sm text-slate-600">Scan → količina → Dodaj → sledeći scan.</p>
          </div>
          <button className="button-primary" onClick={createProposal} type="button">
            Nova najava
          </button>
        </div>
      </section>

      {message ? <p className="rounded-md bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">{message}</p> : null}
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-bold text-slate-950">Moje najave</h2>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {proposals.map((proposal) => (
            <button
              className={`whitespace-nowrap rounded-md border px-3 py-2 text-sm font-semibold ${
                activeProposal?.id === proposal.id ? "border-leaf bg-leaf text-white" : "border-slate-200 bg-white text-slate-700"
              }`}
              key={proposal.id}
              onClick={() => openProposal(proposal.id)}
              type="button"
            >
              {proposal.return_date ?? "-"} · {proposal.status} · {proposal.return_proposal_items?.length ?? 0}
            </button>
          ))}
        </div>
      </section>

      {activeProposal ? (
        <section className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">Status: {activeProposal.status}</p>
                <p className="text-sm text-slate-600">Prvi unos: {formatDateTime(activeProposal.created_at)}</p>
                <p className="text-sm text-slate-600">Poslednja izmena: {formatDateTime(activeProposal.updated_at)}</p>
              </div>
              {!editable ? <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">Zaključano</span> : null}
            </div>
          </div>

          {editable ? (
            <>
              <BarcodeScanner onDetected={handleDetectedBarcode} />

              <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    className="input"
                    disabled={scannerLocked}
                    onChange={(event) => setManual(event.target.value)}
                    placeholder="Barkod, šifra ili naziv"
                    type="text"
                    value={manual}
                  />
                  <button className="button-secondary" disabled={scannerLocked} onClick={manualSearch} type="button">
                    Pronađi
                  </button>
                </div>

                {(scannedBarcode || lookupLoading || lookupError || selectedArticle || results.length > 0) ? (
                  <div className="space-y-3 rounded-md border border-leaf/30 bg-leaf/5 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        {scannedBarcode ? <p className="text-sm font-semibold text-slate-700">Skenirano: {scannedBarcode}</p> : null}
                        {lookupLoading ? <p className="text-sm font-semibold text-amber-700">Tražim artikal...</p> : null}
                        {lookupError ? <p className="text-sm font-semibold text-red-700">{lookupError}</p> : null}
                      </div>
                      <button
                        aria-label="Poništi skenirani artikal"
                        className="flex size-10 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-xl font-bold text-slate-700"
                        onClick={clearScannedArticle}
                        type="button"
                      >
                        ×
                      </button>
                    </div>

                    {results.length > 1 && !selectedArticle ? (
                      <div className="space-y-2">
                        {results.map((article) => (
                          <button
                            className="w-full rounded-md border border-slate-200 bg-white p-3 text-left text-sm hover:border-leaf"
                            key={`${article.article_id}-${article.barcode ?? ""}`}
                            onClick={() => selectArticle(article)}
                            type="button"
                          >
                            <strong>{article.name}</strong>
                            <br />
                            Šifra: {article.article_id} | Barkod: {article.barcode ?? "-"}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {selectedArticle ? (
                      <div className="space-y-3">
                        <div>
                          <p className="font-bold text-slate-950">{selectedArticle.name}</p>
                          <p className="text-sm text-slate-600">
                            Šifra: {selectedArticle.article_id} | Barkod: {selectedArticle.barcode ?? "-"} | Jed. mere: {selectedArticle.unit ?? "-"}
                          </p>
                        </div>
                        <input
                          className="input text-xl font-bold"
                          inputMode="decimal"
                          onChange={(event) => setQuantity(event.target.value)}
                          placeholder="Količina"
                          ref={quantityInputRef}
                          type="number"
                          value={quantity}
                        />
                        <select className="input" onChange={(event) => setReason(event.target.value)} value={reason}>
                          <option value="">Razlog povrata</option>
                          {reasons.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                        <textarea className="input min-h-20" onChange={(event) => setNote(event.target.value)} placeholder="Napomena" value={note} />
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                          <button className="button-primary" onClick={addItem} type="button">
                            Dodaj
                          </button>
                          <button className="button-secondary min-w-12 px-3 text-xl" onClick={clearScannedArticle} type="button">
                            ×
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>
            </>
          ) : null}

          <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-bold text-slate-950">Stavke</h2>
            {items.length === 0 ? <p className="text-sm text-slate-600">Nema stavki.</p> : null}
            {items.map((item) => (
              <article className="rounded-md border border-slate-200 p-3" key={item.id}>
                {editingItemId === item.id ? (
                  <div className="space-y-2">
                    <p className="font-semibold text-slate-950">{item.article_name}</p>
                    <input className="input" inputMode="decimal" onChange={(event) => setEditQuantity(event.target.value)} type="number" value={editQuantity} />
                    <select className="input" onChange={(event) => setEditReason(event.target.value)} value={editReason}>
                      <option value="">Razlog povrata</option>
                      {reasons.map((reason) => (
                        <option key={reason} value={reason}>
                          {reason}
                        </option>
                      ))}
                    </select>
                    <textarea className="input min-h-16" onChange={(event) => setEditNote(event.target.value)} value={editNote} />
                    <div className="grid grid-cols-2 gap-2">
                      <button className="button-primary" onClick={() => saveItem(item)} type="button">
                        Sačuvaj
                      </button>
                      <button className="button-secondary" onClick={() => setEditingItemId(null)} type="button">
                        Otkaži
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{item.article_name}</p>
                      <p className="text-sm text-slate-600">
                        Količina: {item.quantity} {item.unit ?? ""} | Barkod: {item.barcode ?? "-"}
                      </p>
                      {item.reason ? <p className="text-xs text-slate-500">{item.reason}</p> : null}
                    </div>
                    {editable ? (
                      <div className="flex flex-col gap-2">
                        <button className="button-secondary" onClick={() => startEdit(item)} type="button">
                          Izmeni
                        </button>
                        <button className="button-secondary border-red-200 text-red-700" onClick={() => deleteItem(item)} type="button">
                          Obriši
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </article>
            ))}
          </section>
        </section>
      ) : (
        <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">Otvorite novu najavu za početak.</section>
      )}
    </div>
  );
}

function normalizeLookupItems(data: unknown): ArticleLookupItem[] {
  if (Array.isArray(data)) return data as ArticleLookupItem[];
  if (!data || typeof data !== "object") return [];

  const payload = data as {
    article?: ArticleLookupItem | null;
    articles?: ArticleLookupItem[];
    items?: ArticleLookupItem[];
  };

  if (payload.article) return [payload.article];
  if (Array.isArray(payload.articles)) return payload.articles;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("sr-RS", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Belgrade"
  }).format(new Date(value));
}
