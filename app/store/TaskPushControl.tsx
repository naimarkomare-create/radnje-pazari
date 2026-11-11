"use client";

import { useEffect, useRef, useState } from "react";

const endpoint = "/api/store/task-push";
const scope = "/store";

export function TaskPushControl({ publicKey }: { publicKey: string }) {
  const lock = useRef(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const canUsePush = window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(canUsePush);
    if (!canUsePush || Notification.permission !== "granted") {
      setBusy(false);
      return;
    }
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration(scope);
        if (!await registration?.pushManager.getSubscription()) return;
        const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
        if (!response.ok) throw new Error("Status unavailable");
        const data = await response.json();
        if (active) setEnabled(data.enabled === true);
      } catch {
        if (active) setError("Stanje obaveštenja nije dostupno.");
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function toggleNotifications() {
    if (!supported || busy || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (enabled) {
        await saveRegistration("DELETE");
        setEnabled(false);
        const registration = await navigator.serviceWorker.getRegistration(scope);
        await (await registration?.pushManager.getSubscription())?.unsubscribe();
        return;
      }

      // Request permission in the click handler, before waiting on registration or HTTP.
      if (await Notification.requestPermission() !== "granted") {
        setError("Dozvolite obaveštenja za ovu aplikaciju u podešavanjima pregledača.");
        return;
      }
      await navigator.serviceWorker.register("/task-push.js", { scope, updateViaCache: "none" });
      const registration = await readyRegistration();
      const key = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), (byte) => byte.charCodeAt(0));
      // An opt-in after expiry or sign-out must not reuse a stale provider endpoint.
      await (await registration.pushManager.getSubscription())?.unsubscribe();
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await saveRegistration("POST", subscription.toJSON());
      setEnabled(true);
    } catch (failure) {
      setError(failure instanceof Error && failure.name === "RegistrationError"
        ? failure.message : "Podešavanje obaveštenja nije završeno. Pokušajte ponovo.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  if (supported === null) return null;
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-ink">Obaveštenja za zadatke</h2>
        {supported ? (
          <button className="button-secondary" disabled={busy} onClick={toggleNotifications} type="button">
            {busy ? "Provera..." : enabled ? "Isključi obaveštenja" : "Uključi obaveštenja"}
          </button>
        ) : <p className="text-sm text-slate-600">Ovaj pregledač ne podržava obaveštenja.</p>}
      </div>
      {enabled ? <p className="mt-2 text-sm text-green-700" role="status">Obaveštenja su uključena na ovom uređaju.</p> : null}
      {error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}
    </section>
  );
}

async function saveRegistration(method: "POST" | "DELETE", subscription?: PushSubscriptionJSON) {
  const response = await fetch(endpoint, {
    method,
    headers: { "Content-Type": "application/json" },
    body: subscription ? JSON.stringify(subscription) : undefined,
    signal: AbortSignal.timeout(8_000)
  });
  if (response.ok) return;
  const messages: Record<number, string> = {
    400: "Ovaj servis za obaveštenja nije podržan.",
    401: "Sesija je istekla. Prijavite se ponovo.",
    403: "Ovaj nalog ne može da podesi obaveštenja.",
    503: "Obaveštenja još nisu podešena."
  };
  const error = new Error(messages[response.status] ?? "Podešavanje nije sačuvano. Pokušajte ponovo.");
  error.name = "RegistrationError";
  throw error;
}

async function readyRegistration() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Worker not ready")), 10_000); })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
