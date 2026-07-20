"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createSaleActionTasks } from "@/app/admin/biznisoft-akcije/actions";

const ACTION_SYNC_TIMEOUT_MS = 90_000;
const ARTICLE_BATCH_TIMEOUT_MS = 55_000;

export function BizniSoftActionButtons() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [syncLoading, setSyncLoading] = useState(false);
  const [articleSyncLoading, setArticleSyncLoading] = useState(false);
  const [articleRetryAvailable, setArticleRetryAvailable] = useState(false);
  const [articleProgress, setArticleProgress] = useState("");
  const [message, setMessage] = useState("");

  async function onSync() {
    setSyncLoading(true);
    setMessage("");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ACTION_SYNC_TIMEOUT_MS);

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
        setMessage(
          "Sinhronizacija akcija je istekla. Pokušajte ponovo ili proverite BizniSoft servis."
        );
      } else {
        setMessage(
          error instanceof Error
            ? error.message
            : "Sinhronizacija nije uspela."
        );
      }
    } finally {
      clearTimeout(timeout);
      setSyncLoading(false);
    }
  }

  async function onArticleSync() {
    setArticleSyncLoading(true);
    setArticleRetryAvailable(false);
    setArticleProgress("Povezivanje sa BizniSoft servisom...");
    setMessage("");

    const failedArticleIds = new Set<number>();
    let processedArticles = 0;
    let totalArticles = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    try {
      for (let batchNumber = 0; batchNumber < 200; batchNumber += 1) {
        setArticleProgress(
          processedArticles > 0 && totalArticles > 0
            ? `Preuzimanje artikala... Obrađeno ${processedArticles} od ${totalArticles}.`
            : "Preuzimanje artikala..."
        );

        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          ARTICLE_BATCH_TIMEOUT_MS
        );
        let response: Response;

        try {
          response = await fetch(
            "/api/admin/biznisoft/sync-action-articles",
            {
              body: JSON.stringify({
                excludedArticleIds: Array.from(failedArticleIds)
              }),
              headers: { "Content-Type": "application/json" },
              method: "POST",
              signal: controller.signal
            }
          );
        } finally {
          clearTimeout(timeout);
        }

        const result = (await response.json().catch(() => null)) as {
          complete?: boolean;
          createdCount?: number;
          error?: string;
          failedBatch?: Array<{
            articleId: number;
            code: string;
            message: string;
          }>;
          partial?: boolean;
          processedArticles?: number;
          resolvedArticles?: number;
          skippedCount?: number;
          totalArticles?: number;
          unresolvedArticleIds?: number[];
          updatedCount?: number;
        } | null;

        if (!response.ok) {
          throw new Error(
            result?.error ?? "Sinhronizacija artikala nije uspela."
          );
        }

        for (const failure of result?.failedBatch ?? []) {
          failedArticleIds.add(failure.articleId);
        }

        processedArticles = result?.processedArticles ?? processedArticles;
        totalArticles = result?.totalArticles ?? totalArticles;
        createdCount += result?.createdCount ?? 0;
        updatedCount += result?.updatedCount ?? 0;
        if (batchNumber === 0) {
          skippedCount = result?.skippedCount ?? skippedCount;
        }
        setArticleProgress(
          `Obrađeno ${processedArticles} od ${totalArticles} artikala. Čuvanje artikala je završeno za ovaj paket.`
        );

        if (result?.complete) {
          const unresolved = result.unresolvedArticleIds ?? [];

          if (result.partial || unresolved.length > 0) {
            setArticleRetryAvailable(true);
            setMessage(
              `Sinhronizacija je završena delimično. Razrešeno: ${result.resolvedArticles ?? 0}/${totalArticles}. Kreirano: ${createdCount}. Ažurirano: ${updatedCount}. Preskočeno jer je već bilo ispravno: ${skippedCount}. Neuspešno: ${unresolved.length}. ID: ${unresolved.slice(0, 20).join(", ")}${unresolved.length > 20 ? "..." : ""}. Kliknite ponovo za pokušaj samo preostalih artikala.`
            );
          } else {
            setArticleRetryAvailable(false);
            setMessage(
              `Sinhronizacija je završena. Obrađeno: ${totalArticles}. Kreirano: ${createdCount}. Ažurirano: ${updatedCount}. Preskočeno jer je već bilo ispravno: ${skippedCount}.`
            );
          }

          setArticleProgress("");
          router.refresh();
          return;
        }
      }

      throw new Error(
        "Sinhronizacija je zaustavljena zbog prevelikog broja paketa."
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setMessage(
          `BizniSoft servis nije odgovorio na vreme. Sinhronizacija je prekinuta nakon ${processedArticles} od ${totalArticles || "?"} obrađenih artikala. Možete nastaviti ponovnim klikom.`
        );
      } else {
        setMessage(
          `${error instanceof Error ? error.message : "Sinhronizacija artikala nije uspela."} Obrađeno pre prekida: ${processedArticles} od ${totalArticles || "?"}. Možete nastaviti ponovnim klikom.`
        );
      }
      setArticleProgress("");
      setArticleRetryAvailable(true);
    } finally {
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
        <button
          className="button-primary"
          disabled={busy}
          onClick={onSync}
          type="button"
        >
          {syncLoading ? "Sinhronizacija..." : "Sinhronizuj akcije"}
        </button>
        <button
          className="button-secondary"
          disabled={busy}
          onClick={onArticleSync}
          type="button"
        >
          {articleSyncLoading
            ? "Sinhronizacija paketa..."
            : articleRetryAvailable
              ? "Nastavi sinhronizaciju"
              : "Sinhronizuj artikle"}
        </button>
        <button
          className="button-secondary"
          disabled={busy}
          onClick={onCreateTasks}
          type="button"
        >
          {isPending
            ? "Kreiranje..."
            : "Napravi zadatke za sve trenutne i buduće akcije"}
        </button>
      </div>
      {articleProgress ? (
        <p
          aria-live="polite"
          className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800"
        >
          {articleProgress}
        </p>
      ) : null}
      {message ? (
        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
          {message}
        </p>
      ) : null}
    </section>
  );
}
