"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { ArticleLookupItem, ReturnProposal, ReturnProposalItem, ReturnProposalSummary } from "@/lib/types";

const reasons = ["Oštećeno", "Istek roka", "Višak", "Pogrešna isporuka", "Drugo"];

type ItemDraft = {
  quantity: number;
  reason: string;
  note: string;
};

export function ReturnProposalApp({
  initialActiveProposal,
  initialProposals
}: {
  initialActiveProposal: ReturnProposal | null;
  initialProposals: ReturnProposalSummary[];
}) {
  const [proposals, setProposals] = useState(initialProposals);
  const [activeProposal, setActiveProposal] = useState<ReturnProposal | null>(initialActiveProposal);
  const [selectedArticle, setSelectedArticle] = useState<ArticleLookupItem | null>(null);
  const [lookupResetToken, setLookupResetToken] = useState(0);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const editable = activeProposal ? ["draft", "submitted"].includes(activeProposal.status) : false;
  const items = useMemo(() => activeProposal?.return_proposal_items ?? [], [activeProposal]);

  function beginAction(action: string) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setPendingAction(action);
    return true;
  }

  function finishAction() {
    busyRef.current = false;
    setPendingAction(null);
  }

  function resetArticleSelection() {
    setSelectedArticle(null);
    setLookupResetToken((value) => value + 1);
    setError(null);
  }

  async function createProposal() {
    if (!beginAction("create")) return;
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/return-proposals", {
        body: "{}",
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Najava nije kreirana.");
        return;
      }

      const proposal = data.proposal as ReturnProposal;
      const summary = toSummary(proposal);
      setProposals((current) => [summary, ...current].slice(0, 20));
      setActiveProposal(proposal);
      setMessage("Nova najava je otvorena.");
      resetArticleSelection();
    } catch {
      setError("Najava nije kreirana.");
    } finally {
      finishAction();
    }
  }

  async function openProposal(id: string) {
    if (activeProposal?.id === id || !beginAction(`open:${id}`)) return;
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/return-proposals/${id}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Najava nije učitana.");
        return;
      }

      setActiveProposal(data.proposal as ReturnProposal);
      resetArticleSelection();
    } catch {
      setError("Najava nije učitana.");
    } finally {
      finishAction();
    }
  }

  async function addItem(draft: ItemDraft) {
    if (!activeProposal || !selectedArticle || !beginAction("add")) return false;
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/return-proposals/${activeProposal.id}/items`, {
        body: JSON.stringify({
          article_id: selectedArticle.article_id,
          article_name: selectedArticle.name,
          barcode: selectedArticle.barcode,
          note: draft.note,
          quantity: draft.quantity,
          reason: draft.reason,
          unit: selectedArticle.unit
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Artikal nije dodat.");
        return false;
      }

      const item = data.item as ReturnProposalItem;
      setActiveProposal((current) =>
        current
          ? {
              ...current,
              item_count: (current.item_count ?? current.return_proposal_items?.length ?? 0) + 1,
              return_proposal_items: [item, ...(current.return_proposal_items ?? [])].slice(0, 50),
              updated_at: new Date().toISOString()
            }
          : current
      );
      setProposals((current) =>
        current.map((proposal) =>
          proposal.id === activeProposal.id
            ? { ...proposal, item_count: proposal.item_count + 1, updated_at: new Date().toISOString() }
            : proposal
        )
      );
      setMessage(`Dodato: ${selectedArticle.name} x ${draft.quantity}`);
      resetArticleSelection();
      return true;
    } catch {
      setError("Artikal nije dodat.");
      return false;
    } finally {
      finishAction();
    }
  }

  async function deleteItem(item: ReturnProposalItem) {
    if (!activeProposal || !beginAction(`delete:${item.id}`)) return false;
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/return-proposals/${activeProposal.id}/items/${item.id}`, { method: "DELETE" });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Stavka nije obrisana.");
        return false;
      }

      setActiveProposal((current) =>
        current
          ? {
              ...current,
              item_count: Math.max(0, (current.item_count ?? current.return_proposal_items?.length ?? 1) - 1),
              return_proposal_items: (current.return_proposal_items ?? []).filter((currentItem) => currentItem.id !== item.id),
              updated_at: new Date().toISOString()
            }
          : current
      );
      setProposals((current) =>
        current.map((proposal) =>
          proposal.id === activeProposal.id
            ? { ...proposal, item_count: Math.max(0, proposal.item_count - 1), updated_at: new Date().toISOString() }
            : proposal
        )
      );
      setMessage("Stavka je obrisana.");
      return true;
    } catch {
      setError("Stavka nije obrisana.");
      return false;
    } finally {
      finishAction();
    }
  }

  async function saveItem(item: ReturnProposalItem, draft: ItemDraft) {
    if (!activeProposal || !beginAction(`edit:${item.id}`)) return false;
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/return-proposals/${activeProposal.id}/items/${item.id}`, {
        body: JSON.stringify(draft),
        headers: { "Content-Type": "application/json" },
        method: "PATCH"
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Stavka nije izmenjena.");
        return false;
      }

      setActiveProposal((current) =>
        current
          ? {
              ...current,
              return_proposal_items: (current.return_proposal_items ?? []).map((currentItem) =>
                currentItem.id === item.id ? (data.item as ReturnProposalItem) : currentItem
              ),
              updated_at: new Date().toISOString()
            }
          : current
      );
      setMessage("Stavka je izmenjena.");
      return true;
    } catch {
      setError("Stavka nije izmenjena.");
      return false;
    } finally {
      finishAction();
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">Najava povrata</h1>
            <p className="text-sm text-slate-600">Šifra/barkod → količina → Dodaj → sledeći artikal.</p>
          </div>
          <button className="button-primary" disabled={pendingAction !== null} onClick={createProposal} type="button">
            {pendingAction === "create" ? "Otvaranje..." : "Nova najava"}
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
              disabled={pendingAction !== null}
              key={proposal.id}
              onClick={() => openProposal(proposal.id)}
              type="button"
            >
              {proposal.return_date ?? "-"} · {proposal.status} · {proposal.item_count}
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
            <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <ArticleLookupPanel
                locked={Boolean(selectedArticle)}
                onSelect={setSelectedArticle}
                resetToken={lookupResetToken}
              />
              {selectedArticle ? (
                <SelectedArticleForm
                  article={selectedArticle}
                  disabled={pendingAction !== null}
                  onAdd={addItem}
                  onCancel={resetArticleSelection}
                />
              ) : null}
            </section>
          ) : null}

          <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-bold text-slate-950">Stavke</h2>
            {items.length === 0 ? <p className="text-sm text-slate-600">Nema stavki.</p> : null}
            {items.map((item) => (
              <ProposalItemCard
                editable={editable}
                item={item}
                key={item.id}
                onDelete={deleteItem}
                onSave={saveItem}
                pending={pendingAction === `delete:${item.id}` || pendingAction === `edit:${item.id}`}
              />
            ))}
            {(activeProposal.item_count ?? items.length) > items.length ? (
              <p className="text-sm text-slate-500">
                Prikazano je poslednjih {items.length} stavki od ukupno {activeProposal.item_count}.
              </p>
            ) : null}
          </section>
        </section>
      ) : (
        <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">Otvorite novu najavu za početak.</section>
      )}
    </div>
  );
}

function ArticleLookupPanel({
  locked,
  onSelect,
  resetToken
}: {
  locked: boolean;
  onSelect: (article: ArticleLookupItem) => void;
  resetToken: number;
}) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [articles, setArticles] = useState<ArticleLookupItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setValue("");
    setArticles([]);
    setError(null);
    setLoading(false);
    inputRef.current?.focus();
  }, [resetToken]);

  async function lookupArticle() {
    const search = value.trim();
    if (!search || locked || loading) return;

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    setArticles([]);

    try {
      let result = await fetchLookup(`barcode=${encodeURIComponent(search)}`, controller.signal);

      if (!result.article && result.articles.length === 0 && /^\d+$/.test(search)) {
        result = await fetchLookup(`article_id=${encodeURIComponent(search)}`, controller.signal);
      }

      if (!result.article && result.articles.length === 0 && !/^\d+$/.test(search)) {
        result = await fetchLookup(`q=${encodeURIComponent(search)}`, controller.signal);
      }

      if (result.error) {
        setError(result.error);
      } else if (result.article) {
        onSelect(result.article);
      } else if (result.articles.length === 1) {
        onSelect(result.articles[0]);
      } else if (result.articles.length > 1) {
        setArticles(result.articles);
      } else {
        setError(`Artikal nije pronađen za unos: ${search}`);
      }
    } catch (lookupError) {
      if (!(lookupError instanceof DOMException && lookupError.name === "AbortError")) {
        setError("Pretraga nije uspela.");
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="field">
          <span className="label">Šifra ili barkod artikla</span>
          <input
            className="input"
            disabled={locked || loading}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                lookupArticle();
              }
            }}
            placeholder="Unesite barkod ili šifru"
            ref={inputRef}
            type="text"
            value={value}
          />
        </label>
        <button className="button-secondary self-end" disabled={locked || loading || !value.trim()} onClick={lookupArticle} type="button">
          {loading ? "Tražim..." : "Pronađi"}
        </button>
      </div>
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
      {articles.length > 1 ? (
        <div className="space-y-2">
          {articles.map((article) => (
            <button
              className="w-full rounded-md border border-slate-200 bg-white p-3 text-left text-sm hover:border-leaf"
              key={`${article.article_id}-${article.barcode ?? ""}`}
              onClick={() => onSelect(article)}
              type="button"
            >
              <strong>{article.name}</strong>
              <br />
              Šifra: {article.article_id} | Barkod: {article.barcode ?? "-"}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

function SelectedArticleForm({
  article,
  disabled,
  onAdd,
  onCancel
}: {
  article: ArticleLookupItem;
  disabled: boolean;
  onAdd: (draft: ItemDraft) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quantityRef = useRef<HTMLInputElement>(null);

  useEffect(() => quantityRef.current?.focus(), []);

  async function submit() {
    if (submitting || disabled) return;
    const parsedQuantity = Number(quantity);

    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError("Unesite količinu veću od 0.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const added = await onAdd({ note, quantity: parsedQuantity, reason });
    if (!added) setSubmitting(false);
  }

  return (
    <div className="space-y-3 rounded-md border border-leaf/30 bg-leaf/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-slate-950">{article.name}</p>
          <p className="text-sm text-slate-600">
            Šifra: {article.article_id} | Barkod: {article.barcode ?? "-"} | Jed. mere: {article.unit ?? "-"}
          </p>
        </div>
        <button
          aria-label="Poništi izabrani artikal"
          className="flex size-10 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-xl font-bold text-slate-700"
          disabled={submitting || disabled}
          onClick={onCancel}
          type="button"
        >
          ×
        </button>
      </div>
      <input
        className="input text-xl font-bold"
        inputMode="decimal"
        onChange={(event) => setQuantity(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
        placeholder="Količina"
        ref={quantityRef}
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
      {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <button className="button-primary" disabled={submitting || disabled} onClick={submit} type="button">
          {submitting ? "Dodavanje..." : "Dodaj"}
        </button>
        <button className="button-secondary min-w-12 px-3 text-xl" disabled={submitting || disabled} onClick={onCancel} type="button">
          ×
        </button>
      </div>
    </div>
  );
}

function ProposalItemCard({
  editable,
  item,
  onDelete,
  onSave,
  pending
}: {
  editable: boolean;
  item: ReturnProposalItem;
  onDelete: (item: ReturnProposalItem) => Promise<boolean>;
  onSave: (item: ReturnProposalItem, draft: ItemDraft) => Promise<boolean>;
  pending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [reason, setReason] = useState(item.reason ?? "");
  const [note, setNote] = useState(item.note ?? "");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError("Količina mora biti veća od 0.");
      return;
    }

    setError(null);
    if (await onSave(item, { note, quantity: parsedQuantity, reason })) setEditing(false);
  }

  return (
    <article className="rounded-md border border-slate-200 p-3">
      {editing ? (
        <div className="space-y-2">
          <p className="font-semibold text-slate-950">{item.article_name}</p>
          <input className="input" inputMode="decimal" onChange={(event) => setQuantity(event.target.value)} type="number" value={quantity} />
          <select className="input" onChange={(event) => setReason(event.target.value)} value={reason}>
            <option value="">Razlog povrata</option>
            {reasons.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <textarea className="input min-h-16" onChange={(event) => setNote(event.target.value)} value={note} />
          {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <button className="button-primary" disabled={pending} onClick={save} type="button">
              {pending ? "Čuvanje..." : "Sačuvaj"}
            </button>
            <button className="button-secondary" disabled={pending} onClick={() => setEditing(false)} type="button">
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
              <button className="button-secondary" disabled={pending} onClick={() => setEditing(true)} type="button">
                Izmeni
              </button>
              <button className="button-secondary border-red-200 text-red-700" disabled={pending} onClick={() => onDelete(item)} type="button">
                {pending ? "Čuvanje..." : "Obriši"}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}

async function fetchLookup(query: string, signal: AbortSignal) {
  const response = await fetch(`/api/articles/lookup?${query}`, { signal });
  const data = await response.json();

  return {
    article: (data.article ?? null) as ArticleLookupItem | null,
    articles: (Array.isArray(data.articles) ? data.articles : []) as ArticleLookupItem[],
    error: response.ok ? (data.error ?? null) : (data.error ?? "Pretraga nije uspela.")
  };
}

function toSummary(proposal: ReturnProposal): ReturnProposalSummary {
  return {
    created_at: proposal.created_at,
    id: proposal.id,
    item_count: proposal.item_count ?? proposal.return_proposal_items?.length ?? 0,
    return_date: proposal.return_date,
    status: proposal.status,
    store_id: proposal.store_id,
    stores: proposal.stores,
    updated_at: proposal.updated_at
  };
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("sr-RS", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Belgrade"
  }).format(new Date(value));
}
