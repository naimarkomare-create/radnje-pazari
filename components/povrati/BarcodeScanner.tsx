"use client";

import { BrowserMultiFormatReader } from "@zxing/browser";
import { useEffect, useRef, useState } from "react";

export function BarcodeScanner({ onDetected }: { onDetected: (barcode: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScanRef = useRef<{ value: string; time: number }>({ value: "", time: 0 });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, []);

  async function start() {
    setError(null);

    try {
      const reader = new BrowserMultiFormatReader();
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      const backCamera =
        devices.find((device) => /back|rear|environment/i.test(device.label)) ??
        devices[devices.length - 1] ??
        devices[0];

      if (!backCamera || !videoRef.current) {
        setError("Kamera nije pronađena. Unesite barkod ručno.");
        return;
      }

      controlsRef.current = await reader.decodeFromVideoDevice(backCamera.deviceId, videoRef.current, (result) => {
        if (!result) return;

        const value = result.getText().trim();
        const now = Date.now();

        if (lastScanRef.current.value === value && now - lastScanRef.current.time < 1500) return;

        lastScanRef.current = { value, time: now };
        onDetected(value);
      });
      setRunning(true);
    } catch {
      setError("Kamera nije dostupna. Unesite barkod ručno.");
      setRunning(false);
    }
  }

  function stop() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setRunning(false);
  }

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-950">Kamera scanner</h2>
          <p className="text-xs text-slate-500">Scanner ostaje uključen za sledeći artikal.</p>
        </div>
        {running ? (
          <button className="button-secondary" onClick={stop} type="button">
            Stop
          </button>
        ) : (
          <button className="button-primary" onClick={start} type="button">
            Start
          </button>
        )}
      </div>
      <video className="aspect-video w-full rounded-md bg-slate-950 object-cover" muted playsInline ref={videoRef} />
      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
    </section>
  );
}
