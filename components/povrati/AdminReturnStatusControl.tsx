"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmationDialog } from "@/components/povrati/ConfirmationDialog";
import { returnStatusLabel } from "@/lib/return-proposals";
import type { ReturnProposalStatus } from "@/lib/types";

const statuses: ReturnProposalStatus[] = ["draft", "submitted", "reviewed", "completed", "cancelled"];

export function AdminReturnStatusControl({
  proposalId,
  returnHref,
  status
}: {
  proposalId: string;
  returnHref: string;
  status: ReturnProposalStatus;
}) {
  const router = useRouter();
  const deleteInFlight = useRef(false);
  const [value, setValue] = useState(status);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, startTransition] = useTransition();

  async function deleteProposal() {
    if (deleteInFlight.current) return;

    deleteInFlight.current = true;
    setDeleting(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/admin/return-proposals/${proposalId}`,
        { method: "DELETE" }
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        setMessage(
          data.error ?? "Najava povrata nije obrisana. Pokušajte ponovo."
        );
        return;
      }

      const separator = returnHref.includes("?") ? "&" : "?";
      router.replace(`${returnHref}${separator}deleted=1`);
    } catch {
      setMessage("Najava povrata nije obrisana. Pokušajte ponovo.");
    } finally {
      deleteInFlight.current = false;
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="field">
        <span className="label">Status</span>
        <select
          className="input"
          disabled={pending || deleting}
          onChange={(event) => {
            const next = event.target.value as ReturnProposalStatus;
            setValue(next);
            setMessage(null);
            startTransition(async () => {
              const response = await fetch(`/api/admin/return-proposals/${proposalId}/status`, {
                body: JSON.stringify({ status: next }),
                headers: { "Content-Type": "application/json" },
                method: "POST"
              });
              const data = await response.json();

              if (!response.ok) {
                setMessage(data.error ?? "Status nije sačuvan.");
                return;
              }

              setMessage("Status je sačuvan.");
            });
          }}
          value={value}
        >
          {statuses.map((item) => (
            <option key={item} value={item}>
              {returnStatusLabel(item)}
            </option>
          ))}
        </select>
      </label>
      <button
        className="button-secondary w-full border-red-200 text-red-700 hover:bg-red-50"
        disabled={pending || deleting}
        onClick={() => {
          setMessage(null);
          setConfirmingDelete(true);
        }}
        type="button"
      >
        Obriši najavu
      </button>
      {message ? (
        <p aria-live="polite" className="text-sm font-medium text-slate-600">
          {message}
        </p>
      ) : null}
      <ConfirmationDialog
        busy={deleting}
        confirmLabel="Trajno obriši"
        description="Ova radnja će trajno obrisati najavu i sve artikle koji se nalaze u njoj. Brisanje se ne može poništiti."
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={deleteProposal}
        open={confirmingDelete}
        title="Obrisati najavu povrata?"
      />
    </div>
  );
}
