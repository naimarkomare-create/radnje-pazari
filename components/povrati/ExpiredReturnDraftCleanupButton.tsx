"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmationDialog } from "@/components/povrati/ConfirmationDialog";

type CleanupResponse = {
  deletedProposals?: number;
  error?: string;
};

export function ExpiredReturnDraftCleanupButton() {
  const router = useRouter();
  const requestInFlight = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function deleteExpiredDrafts() {
    if (requestInFlight.current) return;

    requestInFlight.current = true;
    setDeleting(true);
    setMessage(null);

    try {
      const response = await fetch(
        "/api/admin/return-proposals/delete-expired-drafts",
        { method: "POST" }
      );
      const data = (await response.json().catch(() => ({}))) as CleanupResponse;

      if (!response.ok) {
        setMessage(
          data.error ?? "Stari nacrti nisu obrisani. Pokušajte ponovo."
        );
        return;
      }

      const deletedProposals = Number(data.deletedProposals ?? 0);
      setConfirming(false);
      setMessage(
        `Obrisano je ${Number.isSafeInteger(deletedProposals) ? deletedProposals : 0} starih nacrta.`
      );
      router.refresh();
    } catch {
      setMessage("Stari nacrti nisu obrisani. Pokušajte ponovo.");
    } finally {
      requestInFlight.current = false;
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        className="button-secondary border-red-200 text-red-700 hover:bg-red-50"
        disabled={deleting}
        onClick={() => {
          setMessage(null);
          setConfirming(true);
        }}
        type="button"
      >
        Obriši stare nacrte
      </button>
      {message ? (
        <p aria-live="polite" className="max-w-md text-sm font-medium text-slate-600">
          {message}
        </p>
      ) : null}
      <ConfirmationDialog
        busy={deleting}
        confirmLabel="Trajno obriši"
        description="Biće trajno obrisani samo nacrti koji nisu menjani duže od punih 20 dana, zajedno sa njihovim stavkama."
        onCancel={() => setConfirming(false)}
        onConfirm={deleteExpiredDrafts}
        open={confirming}
        title="Obrisati stare nacrte?"
      />
    </div>
  );
}
