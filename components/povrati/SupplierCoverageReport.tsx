"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SupplierSearchSelect } from "@/components/povrati/SupplierSearchSelect";
import type {
  SupplierCoverageArticle,
  SupplierCoverageReport as SupplierCoverageData,
  SupplierSearchOption
} from "@/lib/types";

export function SupplierCoverageReport({
  coverage
}: {
  coverage: SupplierCoverageData | null;
}) {
  if (!coverage) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        Izveštaj pokrivenosti će biti dostupan nakon primene migracije za dobavljače.
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="font-bold text-slate-950">Pokrivenost dobavljačima</h2>
        <p className="text-sm text-slate-600">
          Veze se zasnivaju samo na eksplicitnim nabavnim dokumentima ili ručnoj
          admin potvrdi.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Metric label="Broj dobavljača" value={coverage.totalSuppliers} />
        <Metric label="Broj veza" value={coverage.totalRelations} />
        <Metric
          label="Artikli sa dobavljačem"
          value={coverage.articlesWithSupplier}
        />
        <Metric
          label="Artikli bez dobavljača"
          value={coverage.articlesWithoutSupplier}
        />
        <Metric
          label="Pokrivenost"
          value={`${formatNumber(coverage.coveragePercent)}%`}
        />
      </div>

      <div className="grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
        <p>
          Sinhronizovani artikli:{" "}
          <strong className="text-slate-800">
            {formatNumber(coverage.totalArticles)}
          </strong>
        </p>
        <p>
          Poslednja sinhronizacija:{" "}
          <strong className="text-slate-800">
            {formatDateTime(coverage.lastSyncAt)}
          </strong>
        </p>
        <p>
          Obrađene kalkulacije:{" "}
          <strong className="text-slate-800">
            {formatNumber(coverage.processedDocuments)}
          </strong>
        </p>
        <p>
          Period kalkulacija:{" "}
          <strong className="text-slate-800">
            {formatDate(coverage.processedDocumentDateFrom)} –{" "}
            {formatDate(coverage.processedDocumentDateTo)}
          </strong>
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="font-bold text-slate-900">
          Primeri artikala bez automatske veze
        </h3>
        {coverage.unmatchedSample.length === 0 ? (
          <p className="text-sm text-slate-600">
            Nema nepovezanih artikala u uzorku.
          </p>
        ) : null}
        {coverage.unmatchedSample.map((article) => (
          <PermanentMappingCard article={article} key={article.articleId} />
        ))}
        {coverage.articlesWithoutSupplier > coverage.unmatchedSample.length ? (
          <p className="text-xs text-slate-500">
            Prikazan je ograničen uzorak od {coverage.unmatchedSample.length}{" "}
            artikala.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-950">
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
    </div>
  );
}

function PermanentMappingCard({
  article
}: {
  article: SupplierCoverageArticle;
}) {
  const router = useRouter();
  const [supplier, setSupplier] = useState<SupplierSearchOption | null>(null);
  const [isPrimary, setIsPrimary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveMapping() {
    if (!supplier || saving) return;
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/article-suppliers", {
        body: JSON.stringify({
          article_id: article.articleId,
          is_primary: isPrimary,
          supplier_id: supplier.id
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Veza nije sačuvana.");
      }

      setMessage("Veza je sačuvana.");
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Veza nije sačuvana."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="space-y-3 rounded-md border border-slate-200 p-3">
      <div>
        <p className="font-bold text-slate-950">
          {article.name || `Nepoznat artikal (ID: ${article.articleId})`}
        </p>
        <p className="text-sm text-slate-600">
          Šifra: {article.articleId} · Barkod: {article.barcode ?? "-"}
        </p>
        <p className="text-xs text-slate-500">{article.reason}</p>
      </div>
      <SupplierSearchSelect
        disabled={saving}
        onChange={(value) => {
          setSupplier(value);
          setMessage(null);
          setError(null);
        }}
        selected={supplier}
      />
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-700">
        <input
          checked={isPrimary}
          disabled={saving}
          onChange={(event) => setIsPrimary(event.target.checked)}
          type="checkbox"
        />
        Primarni dobavljač
      </label>
      <button
        className="button-secondary w-full"
        disabled={!supplier || saving}
        onClick={saveMapping}
        type="button"
      >
        {saving ? "Čuvanje..." : "Zapamti vezu za ovaj artikal"}
      </button>
      {message ? (
        <p className="text-sm font-semibold text-green-700">{message}</p>
      ) : null}
      {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
    </article>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("sr-RS", {
    maximumFractionDigits: 2
  }).format(value);
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("sr-RS", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Belgrade"
  }).format(new Date(value));
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("sr-RS", {
    dateStyle: "short",
    timeZone: "Europe/Belgrade"
  }).format(new Date(`${value}T12:00:00Z`));
}
