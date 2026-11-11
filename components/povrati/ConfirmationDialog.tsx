"use client";

import { useEffect, useId, useRef } from "react";

type ConfirmationDialogProps = {
  busy: boolean;
  confirmLabel: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
};

export function ConfirmationDialog({
  busy,
  confirmLabel,
  description,
  onCancel,
  onConfirm,
  open,
  title
}: ConfirmationDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      aria-describedby={`${id}-description`}
      aria-labelledby={`${id}-title`}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md rounded-lg bg-white p-0 shadow-xl backdrop:bg-slate-950/50"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) onCancel();
      }}
      ref={dialog}
    >
      <section
        className="break-words p-5"
      >
        <h2 className="text-lg font-bold text-slate-950" id={`${id}-title`}>
          {title}
        </h2>
        <p
          className="mt-2 text-sm leading-6 text-slate-600"
          id={`${id}-description`}
        >
          {description}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            className="button-secondary"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            Otkaži
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 ease-out hover:bg-red-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? "Brisanje..." : confirmLabel}
          </button>
        </div>
      </section>
    </dialog>
  );
}
