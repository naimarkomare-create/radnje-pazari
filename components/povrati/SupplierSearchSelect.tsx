"use client";

import { useEffect, useRef, useState } from "react";
import type { SupplierSearchOption } from "@/lib/types";

export function SupplierSearchSelect({
  disabled = false,
  onChange,
  selected
}: {
  disabled?: boolean;
  onChange: (supplier: SupplierSearchOption | null) => void;
  selected: SupplierSearchOption | null;
}) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ query: string; suppliers: SupplierSearchOption[]; error?: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = query.trim();
  const currentResult = result?.query === search ? result : null;
  const loading = !disabled && search.length >= 2 && !currentResult;
  const results = currentResult?.suppliers ?? [];
  const error = currentResult?.error;

  useEffect(() => {
    if (selected || disabled || search.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/suppliers/search?q=${encodeURIComponent(search)}`,
          { signal: controller.signal }
        );
        const data = await response.json();

        if (controller.signal.aborted) return;
        setResult(response.ok
          ? { query: search, suppliers: Array.isArray(data.suppliers) ? data.suppliers : [] }
          : { query: search, suppliers: [], error: data.error ?? "Pretraga dobavljača nije uspela." });
      } catch {
        if (!controller.signal.aborted) setResult({ query: search, suppliers: [], error: "Pretraga dobavljača nije uspela. Pokušajte ponovo." });
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [disabled, search, selected]);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-leaf/30 bg-white px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500">Izabrani dobavljač</p>
          <p className="break-words text-sm font-bold text-slate-900">{selected.name}</p>
        </div>
        <button
          aria-label="Ukloni izabranog dobavljača"
          className="flex size-11 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-lg font-bold text-slate-700"
          disabled={disabled}
          onClick={() => {
            onChange(null);
            setQuery("");
            setResult(null);
            window.setTimeout(() => inputRef.current?.focus(), 0);
          }}
          type="button"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="field">
        <span className="label">Odaberite dobavljača</span>
        <input
          autoComplete="off"
          className="input"
          disabled={disabled}
          onChange={(event) => {
            if (event.target.value.trim() !== search) setResult(null);
            setQuery(event.target.value);
          }}
          placeholder="Pretražite po nazivu"
          ref={inputRef}
          type="search"
          value={query}
        />
      </label>
      {loading ? <p className="text-sm text-slate-500" role="status">Tražim dobavljače...</p> : null}
      {error ? <p className="text-sm font-semibold text-red-700" role="alert">{error}</p> : null}
      {currentResult && results.length === 0 && !error ? (
        <p className="text-sm text-slate-600" role="status">Nema dobavljača za uneti naziv.</p>
      ) : null}
      {results.length > 0 ? (
        <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-1">
          {results.map((supplier) => (
            <button
              className="min-h-11 w-full break-words rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-100"
              disabled={disabled}
              key={supplier.id}
              onClick={() => {
                onChange(supplier);
                setResult(null);
              }}
              type="button"
            >
              {supplier.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
