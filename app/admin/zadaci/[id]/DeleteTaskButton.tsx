"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteTaskButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function deleteTask() {
    if (deleting) return;
    setDeleting(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/tasks/${encodeURIComponent(taskId)}`, {
        method: "DELETE"
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
        success?: boolean;
        warning?: string;
      } | null;

      if (!response.ok || !result?.success) {
        setError(result?.error ?? "Zadatak nije mogao da bude obrisan.");
        return;
      }

      const params = new URLSearchParams({ deleted: "1" });
      if (result.warning) params.set("warning", "storage");
      router.replace(`/admin/zadaci?${params.toString()}`);
    } catch {
      setError("Zadatak nije mogao da bude obrisan. Pokušajte ponovo.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        className="button-secondary border-red-300 text-red-700 hover:bg-red-50"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
        type="button"
      >
        Obriši zadatak
      </button>

      {open ? (
        <div
          aria-labelledby="delete-task-title"
          aria-modal="true"
          className="fixed inset-0 z-[1000] grid place-items-center bg-slate-950/50 p-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold text-ink" id="delete-task-title">
              Obrisati zadatak?
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Ova radnja će trajno obrisati zadatak i povezane podatke radnji. Brisanje se ne može
              poništiti.
            </p>
            {error ? (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {error}
              </p>
            ) : null}
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                className="button-secondary"
                disabled={deleting}
                onClick={() => setOpen(false)}
                type="button"
              >
                Otkaži
              </button>
              <button
                className="button-primary bg-red-700 hover:bg-red-800"
                disabled={deleting}
                onClick={deleteTask}
                type="button"
              >
                {deleting ? "Brisanje..." : "Trajno obriši"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
