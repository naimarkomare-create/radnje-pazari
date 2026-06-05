"use client";

import { useEffect, useState } from "react";

export function NotificationPermission() {
  const [permission, setPermission] = useState<"default" | "denied" | "granted" | "unsupported">("unsupported");

  useEffect(() => {
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  async function requestPermission() {
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }

    const result = await Notification.requestPermission();
    setPermission(result);

    if (result === "granted") {
      localStorage.setItem("shelf-photo-notifications", "enabled");
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-bold text-ink">Podsetnik za slikanje police</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Dozvola za notifikacije se čuva na ovom uređaju. Slanje dnevnih Web Push podsetnika je sledeći korak za podešavanje.
      </p>
      <button className="button-secondary mt-4" disabled={permission === "granted"} onClick={requestPermission} type="button">
        Uključi notifikacije
      </button>
      <p className="mt-2 text-xs text-slate-500">
        Status: {permission === "unsupported" ? "nije podržano" : permission}
      </p>
    </section>
  );
}
