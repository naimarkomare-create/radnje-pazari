"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SyncKind = "suppliers" | "relations";

type SyncResponse = {
  error?: string;
  received?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  relationsReceived?: number;
  relationsUpserted?: number;
  relationsInDatabase?: number;
  relationsCreated?: number;
  relationsUpdated?: number;
  suppliersReceived?: number;
  suppliersUpserted?: number;
  unmatchedArticles?: number;
  unmatchedSuppliers?: number;
  documentsProcessed?: number;
  documentsRemaining?: number;
  errors?: string[];
};

export function SupplierSyncPanel() {
  const router = useRouter();
  const [pending, setPending] = useState<SyncKind | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function runSync(kind: SyncKind) {
    if (pending) return;
    setPending(kind);
    setMessage(null);
    setWarnings([]);
    setError(null);

    try {
      const endpoint =
        kind === "suppliers"
          ? "/api/admin/biznisoft/suppliers/sync"
          : "/api/admin/biznisoft/article-suppliers/sync";
      const response = await fetch(endpoint, { method: "POST" });
      const result = (await response.json()) as SyncResponse;
      if (!response.ok) throw new Error(result.error ?? "Sinhronizacija nije uspela.");

      const nextWarnings = Array.isArray(result.errors) ? result.errors : [];
      if (kind === "relations" && (result.relationsInDatabase ?? 0) === 0) {
        nextWarnings.push(
          "Dobavljači su sinhronizovani, ali nije pronađena nijedna veza između artikala i dobavljača."
        );
      }
      setWarnings(Array.from(new Set(nextWarnings)));
      setMessage(
        kind === "suppliers"
          ? `Dobavljači primljeni: ${result.suppliersReceived ?? result.received ?? 0} · Upisani: ${result.suppliersUpserted ?? ((result.created ?? 0) + (result.updated ?? 0))} · Kreirano: ${result.created ?? 0} · Ažurirano: ${result.updated ?? 0} · Preskočeno: ${result.skipped ?? 0}`
          : `Veze primljene: ${result.relationsReceived ?? 0} · Upisane: ${result.relationsUpserted ?? 0} · Ukupno u bazi: ${result.relationsInDatabase ?? 0} · Kreirano: ${result.relationsCreated ?? 0} · Ažurirano: ${result.relationsUpdated ?? 0} · Nepovezani artikli: ${result.unmatchedArticles ?? 0} · Nepoznati dobavljači: ${result.unmatchedSuppliers ?? 0} · Dokumenti: ${result.documentsProcessed ?? 0} · Preostalo: ${result.documentsRemaining ?? 0}`
      );
      router.refresh();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Sinhronizacija nije uspela.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="font-bold text-slate-950">BizniSoft dobavljači</h2>
        <p className="text-sm text-slate-600">
          Prvo sinhronizujte dobavljače, zatim veze artikala. Veze se obrađuju u bezbednim paketima.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          className="button-secondary"
          disabled={pending !== null}
          onClick={() => runSync("suppliers")}
          type="button"
        >
          {pending === "suppliers" ? "Sinhronizacija..." : "Sinhronizuj dobavljače"}
        </button>
        <button
          className="button-secondary"
          disabled={pending !== null}
          onClick={() => runSync("relations")}
          type="button"
        >
          {pending === "relations" ? "Sinhronizacija..." : "Sinhronizuj veze artikala"}
        </button>
      </div>
      {message ? <p className="text-sm font-semibold text-green-700">{message}</p> : null}
      {warnings.length > 0 ? (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {warnings.slice(0, 5).map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          {warnings.length > 5 ? <p>Još upozorenja: {warnings.length - 5}</p> : null}
        </div>
      ) : null}
      {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
