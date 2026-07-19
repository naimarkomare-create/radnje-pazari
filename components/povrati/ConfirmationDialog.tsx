"use client";

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
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-4 sm:items-center"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) onCancel();
      }}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) onCancel();
      }}
      role="presentation"
    >
      <section
        aria-describedby="return-delete-description"
        aria-labelledby="return-delete-title"
        aria-modal="true"
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
        role="dialog"
      >
        <h2 className="text-lg font-bold text-slate-950" id="return-delete-title">
          {title}
        </h2>
        <p
          className="mt-2 text-sm leading-6 text-slate-600"
          id="return-delete-description"
        >
          {description}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            autoFocus
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
    </div>
  );
}
