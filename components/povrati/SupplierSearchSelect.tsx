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
  const [results, setResults] = useState<SupplierSearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selected) return;
    const value = query.trim();

    if (value.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/suppliers/search?q=${encodeURIComponent(value)}`,
          { signal: controller.signal }
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Pretraga dobavljača nije uspela.");
        }

        setResults(Array.isArray(data.suppliers) ? data.suppliers : []);
      } catch (searchError) {
        if (
          !(searchError instanceof DOMException && searchError.name === "AbortError")
        ) {
          setError(
            searchError instanceof Error
              ? searchError.message
              : "Pretraga dobavljača nije uspela."
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected]);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-leaf/30 bg-white px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500">Izabrani dobavljač</p>
          <p className="truncate text-sm font-bold text-slate-900">{selected.name}</p>
        </div>
        <button
          aria-label="Ukloni izabranog dobavljača"
          className="flex size-10 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-lg font-bold text-slate-700"
          disabled={disabled}
          onClick={() => {
            onChange(null);
            setQuery("");
            setResults([]);
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
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Pretražite po nazivu"
          ref={inputRef}
          type="search"
          value={query}
        />
      </label>
      {loading ? <p className="text-sm text-slate-500">Tražim dobavljače...</p> : null}
      {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
      {!loading && query.trim().length >= 2 && results.length === 0 && !error ? (
        <p className="text-sm text-slate-600">Nema dobavljača za uneti naziv.</p>
      ) : null}
      {results.length > 0 ? (
        <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-1">
          {results.map((supplier) => (
            <button
              className="w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-100"
              disabled={disabled}
              key={supplier.id}
              onClick={() => {
                onChange(supplier);
                setResults([]);
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
