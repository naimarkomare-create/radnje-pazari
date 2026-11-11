"use client";

import { useRef, useState, type FormEvent } from "react";
import { submitShelfPhotoMetadata } from "@/app/store/kontrola-police/actions";
import { SHELF_PHOTOS_BUCKET } from "@/lib/shelf-photos";
import type { ActionState } from "@/lib/types";

export function ShelfPhotoForm({ storeId, today }: { storeId: string; today: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const [checkDate, setCheckDate] = useState(today);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<ActionState>({ ok: false, message: "" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    setState({ ok: false, message: "" });

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setState({ ok: false, message: "Izaberite sliku." });
      return;
    }

    submittingRef.current = true;
    setLoading(true);

    try {
      const [{ compressImage }, { createClient }] = await Promise.all([
        import("@/lib/image-compression"),
        import("@/lib/supabase/client")
      ]);
      const compressed = await compressImage(file);
      const objectPath = `${checkDate}/${storeId}/${Date.now()}.jpg`;
      const storagePath = `${SHELF_PHOTOS_BUCKET}/${objectPath}`;
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(SHELF_PHOTOS_BUCKET)
        .upload(objectPath, compressed, {
          contentType: "image/jpeg",
          upsert: false
        });

      if (uploadError) {
        setState({ ok: false, message: "Slika nije otpremljena. Proverite vezu i pokušajte ponovo." });
        return;
      }

      const result = await submitShelfPhotoMetadata({ checkDate, storagePath, note });
      setState(result);

      if (result.ok) {
        setNote("");
        if (fileRef.current) fileRef.current.value = "";
      }
    } catch {
      setState({ ok: false, message: "Slanje slike nije uspelo. Pokušajte ponovo." });
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5" onSubmit={onSubmit}>
      <label className="field max-w-xs">
        <span className="label">Datum</span>
        <input className="input" disabled={loading} onChange={(event) => setCheckDate(event.target.value)} required type="date" value={checkDate} />
      </label>
      <label className="field">
        <span className="label">Slikaj policu</span>
        <input
          ref={fileRef}
          accept="image/*"
          capture="environment"
          className="input"
          disabled={loading}
          required
          type="file"
        />
      </label>
      <label className="field">
        <span className="label">Napomena</span>
        <textarea className="input min-h-24 resize-y" disabled={loading} onChange={(event) => setNote(event.target.value)} value={note} />
      </label>
      {state.message ? (
        <p className={`rounded-md px-3 py-3 text-sm ${state.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`} role={state.ok ? "status" : "alert"}>
          {state.message}
        </p>
      ) : null}
      <button className="button-primary w-full sm:w-auto" disabled={loading} type="submit">
        {loading ? "Slanje..." : "Pošalji sliku"}
      </button>
    </form>
  );
}
