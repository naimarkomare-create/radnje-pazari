"use client";

import { useState, useTransition } from "react";
import type { ReturnProposalStatus } from "@/lib/types";

const statuses: ReturnProposalStatus[] = ["draft", "submitted", "reviewed", "completed", "cancelled"];

export function AdminReturnStatusControl({ proposalId, status }: { proposalId: string; status: ReturnProposalStatus }) {
  const [value, setValue] = useState(status);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <label className="field">
        <span className="label">Status</span>
        <select
          className="input"
          disabled={pending}
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
              {item}
            </option>
          ))}
        </select>
      </label>
      {message ? <p className="text-sm font-medium text-slate-600">{message}</p> : null}
    </div>
  );
}
