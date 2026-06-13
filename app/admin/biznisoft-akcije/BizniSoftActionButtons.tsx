"use client";

import { useState, useTransition } from "react";
import { createSaleActionTasks } from "@/app/admin/biznisoft-akcije/actions";

const CLIENT_SYNC_TIMEOUT_MS = 90_000;

export function BizniSoftActionButtons() {
  const [isPending, startTransition] = useTransition();
  const [syncLoading, setSyncLoading] = useState(false);
  const [articleSyncLoading, setArticleSyncLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function onSync() {
    setSyncLoading(true);
    setMessage("");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLIENT_SYNC_TIMEOUT_MS);

    try {
      const response = await fetch("/api/admin/biznisoft/sync-sale-actions", {
        method: "POST",
        signal: controller.signal
      });
      const result = (await response.json()) as {
        actionType1RawCount?: number;
        actionType2RawCount?: number;
        actionType3RawCount?: number;
        error?: string;
        faults?: Array<{ actionType: number; fault: string }>;
        normalizedRowsCount?: number;
        rowsInDatabaseAfterSync?: number;
        rowsUpsertedCount?: number;
      };

      if (!response.ok) {
        setMessage(result.error ?? "Sinhronizacija nije uspela.");
      } else {
        const faultText = result.faults?.length
          ? ` Greške: ${result.faults.map((fault) => `ActionType ${fault.actionType}: ${fault.fault}`).join(" | ")}`
          : "";
        setMessage(
          `Sinhronizovano akcija: ${result.rowsUpsertedCount ?? 0}. U bazi ukupno: ${result.rowsInDatabaseAfterSync ?? 0}. Raw: tip 1 = ${result.actionType1RawCount ?? 0}, tip 2 = ${result.actionType2RawCount ?? 0}, tip 3 = ${result.actionType3RawCount ?? 0}. Normalizovano: ${result.normalizedRowsCount ?? 0}.${faultText}`
        );
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setMessage("Sinhronizacija akcija je istekla. Pokušajte ponovo ili proverite BizniSoft servis.");
      } else {
        setMessage(error instanceof Error ? error.message : "Sinhronizacija nije uspela.");
      }
    } finally {
      clearTimeout(timeout);
      setSyncLoading(false);
    }
  }

  async function onArticleSync() {
    setArticleSyncLoading(true);
    setMessage("");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLIENT_SYNC_TIMEOUT_MS);

    try {
      const response = await fetch("/api/admin/biznisoft/sync-action-articles", {
        method: "POST",
        signal: controller.signal
      });
      const result = (await response.json()) as {
        articleRowsFetchedByCode?: number;
        articleRowsFetchedById?: number;
        barcodeRowsFetched?: number;
        error?: string;
        fetchedArticles?: number;
        missingArticles?: number;
        uniqueArticleIds?: number;
        uniqueArticleIdsCount?: number;
        unresolvedArticleIds?: number[];
        upsertedArticles?: number;
      };

      if (!response.ok) {
        setMessage(result.error ?? "Sinhronizacija artikala nije uspela.");
      } else {
        const unresolved =
          result.unresolvedArticleIds && result.unresolvedArticleIds.length > 0
            ? ` Nerazrešeni ID: ${result.unresolvedArticleIds.slice(0, 20).join(", ")}${result.unresolvedArticleIds.length > 20 ? "..." : ""}.`
            : "";
        setMessage(
          `ArticleID vrednosti: ${result.uniqueArticleIdsCount ?? result.uniqueArticleIds ?? 0}. Po ID: ${result.articleRowsFetchedById ?? 0}. Po kodu/CatNo: ${result.articleRowsFetchedByCode ?? 0}. Barkod redova: ${result.barcodeRowsFetched ?? 0}. Artikala preuzeto: ${result.fetchedArticles ?? 0}. Artikala upisano: ${result.upsertedArticles ?? 0}. Nedostaje: ${result.missingArticles ?? 0}.${unresolved} Osvežite stranicu ako tabela nije ažurirana.`
        );
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setMessage("Sinhronizacija artikala je istekla. Pokušajte ponovo ili proverite BizniSoft servis.");
      } else {
        setMessage(error instanceof Error ? error.message : "Sinhronizacija artikala nije uspela.");
      }
    } finally {
      clearTimeout(timeout);
      setArticleSyncLoading(false);
    }
  }

  function onCreateTasks() {
    setMessage("");
    startTransition(async () => {
      const result = await createSaleActionTasks();
      setMessage(result.message);
    });
  }

  const busy = syncLoading || articleSyncLoading || isPending;

  return (
    <section className="interactive-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button className="button-primary" disabled={busy} onClick={onSync} type="button">
          {syncLoading ? "Sinhronizacija..." : "Sinhronizuj akcije"}
        </button>
        <button className="button-secondary" disabled={busy} onClick={onArticleSync} type="button">
          {articleSyncLoading ? "Sinhronizacija..." : "Sinhronizuj artikle"}
        </button>
        <button className="button-secondary" disabled={busy} onClick={onCreateTasks} type="button">
          {isPending ? "Kreiranje..." : "Napravi zadatke za sve trenutne i buduće akcije"}
        </button>
      </div>
      {message ? <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">{message}</p> : null}
    </section>
  );
}
