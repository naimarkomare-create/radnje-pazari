"use client";

import { useState } from "react";
import { deleteShelfPhoto } from "@/app/admin/kontrola-police/actions";

export function DeleteShelfPhotoButton({ photoId }: { photoId: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function onDelete() {
    if (!window.confirm("Da li sigurno želiš da obrišeš ovu sliku?")) return;

    setLoading(true);
    setMessage("");
    const result = await deleteShelfPhoto(photoId);
    setMessage(result.message);
    setLoading(false);
  }

  return (
    <div className="space-y-2">
      <button className="button-secondary border-red-200 text-red-700 hover:bg-red-50" disabled={loading} onClick={onDelete} type="button">
        {loading ? "Brisanje..." : "Obriši sliku"}
      </button>
      {message ? <p className="text-xs font-semibold text-slate-600">{message}</p> : null}
    </div>
  );
}
