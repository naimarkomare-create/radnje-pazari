"use client";

import { useRef, useState } from "react";
import { downloadResponseFile } from "@/lib/client-download";

export function WriteoffExportButtons({ listId, reference }: { listId: string; reference: string }) {
  const lock = useRef(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function download(kind: "biznisoft" | "supplier") {
    if (lock.current) return;
    lock.current = true;
    setPending(kind);
    setError("");
    try {
      const query = kind === "biznisoft" ? "?mode=test" : "";
      const response = await fetch(`/api/admin/popis-otpis/${listId}/export/${kind}${query}`);
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? "Izvoz nije uspeo. Pokušajte ponovo.");
      }
      await downloadResponseFile(response, `otpis-${reference}.xlsx`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Izvoz nije uspeo. Pokušajte ponovo.");
    } finally {
      lock.current = false;
      setPending(null);
    }
  }

  return (
    <div className="mt-5 grid gap-2 sm:grid-cols-2">
      <div className="grid gap-1">
        <button className="button-primary" disabled={pending !== null} onClick={() => void download("biznisoft")} type="button">{pending === "biznisoft" ? "Priprema izvoza..." : "BizniSoft izvoz"}</button>
        <span className="text-xs text-slate-500">Probni XLSX</span>
      </div>
      <button className="button-secondary" disabled={pending !== null} onClick={() => void download("supplier")} type="button">{pending === "supplier" ? "Priprema izvoza..." : "Preuzmi Excel za dobavljača"}</button>
      {error ? <p className="break-words rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 sm:col-span-2" role="alert">Izvoz nije moguć: {error}</p> : null}
      <p className="text-xs text-slate-600 sm:col-span-2">Aplikacija priprema Excel; ne uvozi, ne potvrđuje i ne knjiži dokument u BizniSoft-u.</p>
    </div>
  );
}
