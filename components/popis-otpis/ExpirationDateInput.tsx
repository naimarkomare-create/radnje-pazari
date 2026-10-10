"use client";

import { useId, useState } from "react";
import { formatWriteoffDate, parseWriteoffDate } from "@/lib/writeoff-date";

const months = ["Januar", "Februar", "Mart", "April", "Maj", "Jun", "Jul", "Avgust", "Septembar", "Oktobar", "Novembar", "Decembar"];

export function ExpirationDateInput({ value, onChange, disabled = false }: {
  value: string;
  onChange: (display: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const iso = parseWriteoffDate(value);
    if (iso) return iso.slice(0, 7);
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Belgrade" }).format(new Date());
    return today.slice(0, 7);
  });
  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const invalid = Boolean(value && !parseWriteoffDate(value));

  function moveMonth(offset: number) {
    const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
    if (date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2099) return;
    setMonth(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <div className="min-w-0">
      <label className="text-sm font-semibold text-slate-700" htmlFor={id}>Datum isteka roka</label>
      <div className="mt-1 grid gap-2 min-[390px]:grid-cols-[minmax(0,1fr)_auto]">
        <input id={id} className="input min-w-0 w-full text-lg" type="text" inputMode="numeric"
          placeholder="DD/MM/YY" autoComplete="off" maxLength={8} value={value} disabled={disabled}
          aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "").slice(0, 6);
            onChange(digits.replace(/^(\d{2})(\d)/, "$1/$2").replace(/^(\d{2}\/\d{2})(\d)/, "$1/$2"));
          }} />
        <button className="button-secondary shrink-0 px-3" type="button" disabled={disabled}
          aria-expanded={open && !disabled} aria-controls={`${id}-calendar`}
          onClick={() => {
            const iso = parseWriteoffDate(value);
            if (iso) setMonth(iso.slice(0, 7));
            setOpen(!open);
          }}>Kalendar</button>
      </div>
      {invalid ? <p id={`${id}-error`} className="mt-1 text-xs text-red-700">Unesite ispravan datum DD/MM/YY.</p> : null}
      {open && !disabled ? (
        <div id={`${id}-calendar`} className="mt-2 rounded-md border border-slate-200 bg-white p-2" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } }}>
          <div className="flex items-center justify-between gap-1">
            <button type="button" className="h-11 w-11 shrink-0" aria-label="Prethodni mesec" disabled={month === "2000-01"} onClick={() => moveMonth(-1)}>{"<"}</button>
            <span className="text-sm font-semibold" aria-live="polite">{months[monthNumber - 1]} {year}</span>
            <button type="button" className="h-11 w-11 shrink-0" aria-label="Sledeći mesec" disabled={month === "2099-12"} onClick={() => moveMonth(1)}>{">"}</button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs">
            {["Po", "Ut", "Sr", "Če", "Pe", "Su", "Ne"].map((day) => <span className="py-2" key={day}>{day}</span>)}
            {Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} />)}
            {Array.from({ length: dayCount }, (_, index) => {
              const iso = `${month}-${String(index + 1).padStart(2, "0")}`;
              const display = formatWriteoffDate(iso);
              return <button type="button" className={`h-11 rounded text-sm ${value === display ? "bg-leaf text-white" : "hover:bg-slate-100"}`}
                key={iso} aria-label={display} aria-pressed={value === display}
                onClick={() => { onChange(display); setOpen(false); }}>{index + 1}</button>;
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
