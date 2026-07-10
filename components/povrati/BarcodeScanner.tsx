"use client";

import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { useEffect, useRef, useState } from "react";

export function BarcodeScanner({ onDetected }: { onDetected: (barcode: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastScanRef = useRef<{ value: string; time: number }>({ value: "", time: 0 });
  const startingRef = useRef(false);
  const [running, setRunning] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => stop();
  }, []);

  async function start() {
    if (running || startingRef.current) return;

    setError(null);
    startingRef.current = true;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Kamera nije podržana u ovom browseru. Unesi barkod ručno.");
        return;
      }

      if (!videoRef.current) return;

      readerRef.current = new BrowserMultiFormatReader();
      controlsRef.current = await readerRef.current.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" }
          }
        },
        videoRef.current,
        (result) => {
          if (!result) return;

          const barcode = result.getText().trim();
          const now = Date.now();

          if (!barcode) return;
          if (lastScanRef.current.value === barcode && now - lastScanRef.current.time < 1500) return;

          lastScanRef.current = { value: barcode, time: now };
          onDetected(barcode);
        }
      );
      setRunning(true);
    } catch {
      stop();
      setError("Kamera nije dostupna ili dozvola nije odobrena. Unesi barkod ručno.");
    } finally {
      startingRef.current = false;
    }
  }

  function stop() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    readerRef.current = null;
    setRunning(false);

    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current!.srcObject = null;
    }
  }

  function submitManual() {
    const barcode = manualBarcode.trim();
    if (!barcode) return;

    onDetected(barcode);
    setManualBarcode("");
  }

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-950">Kamera scanner</h2>
          <p className="text-xs text-slate-500">Kamera ostaje spremna za sledeći barkod.</p>
        </div>
        {running ? (
          <button className="button-secondary" onClick={stop} type="button">
            Zaustavi kameru
          </button>
        ) : (
          <button className="button-primary" onClick={start} type="button">
            Pokreni kameru
          </button>
        )}
      </div>

      <video className="aspect-video w-full rounded-md bg-slate-950 object-cover" muted playsInline ref={videoRef} />

      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          className="input"
          inputMode="numeric"
          onChange={(event) => setManualBarcode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submitManual();
          }}
          placeholder="Unesi barkod ručno"
          type="text"
          value={manualBarcode}
        />
        <button className="button-secondary" onClick={submitManual} type="button">
          Pronađi
        </button>
      </div>
    </section>
  );
}
