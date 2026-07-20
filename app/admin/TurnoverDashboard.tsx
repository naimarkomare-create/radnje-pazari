"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BizniSoftTurnoverResult } from "@/lib/biznisoft/turnover-types";
import { BELGRADE_TIME_ZONE, formatSerbianIsoDate } from "@/lib/date";

type DayState = {
  data: BizniSoftTurnoverResult | null;
  error: string | null;
  loading: boolean;
};

type SuccessResponse = BizniSoftTurnoverResult & { success: true };
type ErrorResponse = {
  success: false;
  error?: string;
  refreshing?: boolean;
};

const REFRESH_SECONDS = 30;

export function TurnoverDashboard({
  today,
  yesterday,
  dayBeforeYesterday
}: {
  today: string;
  yesterday: string;
  dayBeforeYesterday: string;
}) {
  const dates = [today, yesterday, dayBeforeYesterday];
  const [days, setDays] = useState<Record<string, DayState>>(() =>
    Object.fromEntries(
      dates.map((date) => [date, { data: null, error: null, loading: false }])
    )
  );
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const requestLocks = useRef(new Set<string>());
  const controllers = useRef(new Map<string, AbortController>());
  const countdownRef = useRef(REFRESH_SECONDS);
  const lastTodayAttemptAt = useRef(0);

  const requestTurnover = useCallback(
    async (businessDate: string, force = false) => {
      if (requestLocks.current.has(businessDate)) return;

      requestLocks.current.add(businessDate);
      if (businessDate === today) lastTodayAttemptAt.current = Date.now();
      setDays((current) => ({
        ...current,
        [businessDate]: {
          ...(current[businessDate] ?? { data: null, error: null }),
          loading: true
        }
      }));

      const controller = new AbortController();
      controllers.current.set(businessDate, controller);

      try {
        let response: Response | null = null;
        let body: SuccessResponse | ErrorResponse | null = null;

        for (let attempt = 0; attempt < 3; attempt += 1) {
          const params = new URLSearchParams({ date: businessDate });
          if (force) params.set("force", "true");

          response = await fetch(`/api/admin/biznisoft/turnover?${params.toString()}`, {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal
          });
          body = (await response.json()) as SuccessResponse | ErrorResponse;

          if (response.status !== 202 || body.success || attempt === 2) break;
          await wait(1500, controller.signal);
        }

        if (!response || !body || !response.ok || !body.success) {
          throw new Error(body && !body.success && body.error ? body.error : "Promet nije dostupan.");
        }

        const { success: _success, ...data } = body;
        setDays((current) => ({
          ...current,
          [businessDate]: {
            data,
            error: null,
            loading: false
          }
        }));
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;

        setDays((current) => ({
          ...current,
          [businessDate]: {
            data: current[businessDate]?.data ?? null,
            error:
              error instanceof Error
                ? error.message
                : "Promet trenutno nije moguće preuzeti iz BizniSoft-a.",
            loading: false
          }
        }));
      } finally {
        requestLocks.current.delete(businessDate);
        controllers.current.delete(businessDate);

        if (businessDate === today) {
          countdownRef.current = REFRESH_SECONDS;
          setCountdown(REFRESH_SECONDS);
        }
      }
    },
    [today]
  );

  useEffect(() => {
    let active = true;
    const activeControllers = controllers.current;
    const activeRequestLocks = requestLocks.current;

    void (async () => {
      await requestTurnover(today);
      if (!active) return;
      await Promise.all([
        requestTurnover(yesterday),
        requestTurnover(dayBeforeYesterday)
      ]);
    })();

    return () => {
      active = false;
      for (const controller of activeControllers.values()) controller.abort();
      activeControllers.clear();
      activeRequestLocks.clear();
    };
  }, [dayBeforeYesterday, requestTurnover, today, yesterday]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;

      countdownRef.current -= 1;
      if (countdownRef.current <= 0) {
        countdownRef.current = REFRESH_SECONDS;
        setCountdown(REFRESH_SECONDS);
        void requestTurnover(today);
        return;
      }

      setCountdown(countdownRef.current);
    }, 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;

      const elapsedSeconds = Math.floor((Date.now() - lastTodayAttemptAt.current) / 1000);
      if (elapsedSeconds >= REFRESH_SECONDS) {
        void requestTurnover(today);
        return;
      }

      countdownRef.current = Math.max(1, REFRESH_SECONDS - elapsedSeconds);
      setCountdown(countdownRef.current);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [requestTurnover, today]);

  const todayState = days[today];

  return (
    <div className="page-content">
      <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-leaf">Današnji promet</p>
          <p className="mt-1 text-sm text-slate-600">Automatsko osvežavanje na 30 sekundi</p>
          <p className="mt-1 text-sm font-medium text-slate-700" aria-live="polite">
            Sledeće osvežavanje za {countdown} sekundi
          </p>
        </div>
        <button
          className="button-primary w-full sm:w-auto"
          disabled={todayState?.loading}
          onClick={() => void requestTurnover(today, true)}
          type="button"
        >
          {todayState?.loading ? (
            <>
              <span
                aria-hidden="true"
                className="mr-2 size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
              />
              Osvežavanje...
            </>
          ) : (
            "Osveži sada"
          )}
        </button>
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-3">
        <TurnoverCard
          businessDate={today}
          emphasized
          label="Danas"
          onRetry={() => void requestTurnover(today, true)}
          state={days[today]}
        />
        <TurnoverCard
          businessDate={yesterday}
          label="Juče"
          onRetry={() => void requestTurnover(yesterday, true)}
          state={days[yesterday]}
        />
        <TurnoverCard
          businessDate={dayBeforeYesterday}
          label="Prekjuče"
          onRetry={() => void requestTurnover(dayBeforeYesterday, true)}
          state={days[dayBeforeYesterday]}
        />
      </section>
    </div>
  );
}

function TurnoverCard({
  businessDate,
  label,
  state,
  emphasized = false,
  onRetry
}: {
  businessDate: string;
  label: string;
  state: DayState | undefined;
  emphasized?: boolean;
  onRetry: () => void;
}) {
  const data = state?.data ?? null;
  const visibleWarning = state?.error ?? data?.warning ?? null;
  const status = statusFor(state);

  return (
    <article
      className={`min-w-0 overflow-hidden rounded-lg border bg-white shadow-sm ${
        emphasized ? "border-leaf ring-1 ring-leaf/20" : "border-slate-200"
      }`}
    >
      <header
        className={`flex items-start justify-between gap-3 border-b px-4 py-4 ${
          emphasized ? "border-leaf/20 bg-green-50" : "border-slate-200 bg-slate-50"
        }`}
      >
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
          <h2 className="mt-1 text-xl font-bold text-ink">{formatSerbianIsoDate(businessDate)}</h2>
          <p className="mt-1 text-sm text-slate-600">Dnevni promet</p>
        </div>
        <StatusBadge status={status} />
      </header>

      {data ? (
        <>
          <div className="border-b border-slate-200 px-4 py-5">
            <p className="text-xs font-bold uppercase text-slate-500">Ukupno na dan</p>
            <p className="mt-2 break-words text-3xl font-bold text-ink">
              {formatRsd(data.total)}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>
                {data.representedStores}{" "}
                {data.representedStores === 1 ? "radnja" : "radnji"}
              </span>
              <span>Izvor: BizniSoft</span>
            </div>
          </div>

          {visibleWarning ? (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {visibleWarning}
            </div>
          ) : null}

          <div className="px-4 py-4">
            <h3 className="text-xs font-bold uppercase text-slate-500">Promet po radnjama</h3>
            <div className="mt-3 divide-y divide-slate-200">
              {data.stores.map((store) => (
                <div
                  className="flex min-w-0 items-center justify-between gap-3 py-3 text-sm"
                  key={store.storeId}
                >
                  <span className="min-w-0 truncate font-semibold text-slate-700">
                    {store.storeName}
                  </span>
                  <span
                    className={`shrink-0 text-right font-bold ${
                      store.amount === null ? "text-amber-700" : "text-ink"
                    }`}
                  >
                    {store.amount === null ? "Nije povezano" : formatRsd(store.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <footer className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            Poslednje uspešno osvežavanje: {formatBelgradeTime(data.fetchedAt)}
          </footer>
        </>
      ) : (
        <div className="px-4 py-8">
          {state?.loading ? (
            <div className="space-y-4" aria-label="Učitavanje prometa">
              <div className="h-8 w-2/3 animate-pulse rounded bg-slate-200" />
              <div className="space-y-3">
                {Array.from({ length: 5 }, (_, index) => (
                  <div className="h-5 animate-pulse rounded bg-slate-100" key={index} />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-800">
                Promet trenutno nije moguće preuzeti iz BizniSoft-a.
              </p>
              {visibleWarning ? (
                <p className="mt-2 text-sm text-slate-600">{visibleWarning}</p>
              ) : null}
              <button className="button-secondary mt-4" onClick={onRetry} type="button">
                Pokušaj ponovo
              </button>
            </div>
          )}
        </div>
      )}

      {data && state?.loading ? (
        <div className="border-t border-sky-200 bg-sky-50 px-4 py-2 text-center text-xs font-semibold text-sky-800">
          Osvežavanje podataka...
        </div>
      ) : null}
    </article>
  );
}

function StatusBadge({ status }: { status: "fresh" | "stale" | "loading" | "error" }) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-700",
    fresh: "border-emerald-200 bg-emerald-50 text-emerald-700",
    loading: "border-sky-200 bg-sky-50 text-sky-700",
    stale: "border-amber-200 bg-amber-50 text-amber-800"
  };
  const labels = {
    error: "Nedostupno",
    fresh: "Ažurno",
    loading: "Osvežavanje",
    stale: "Poslednji podaci"
  };

  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function statusFor(state: DayState | undefined) {
  if (state?.loading) return "loading" as const;
  if (state?.data?.refreshing) return "loading" as const;
  if (state?.error && state.data) return "stale" as const;
  if (state?.data?.stale) return "stale" as const;
  if (state?.data) return "fresh" as const;
  return "error" as const;
}

function formatRsd(value: number) {
  return `${value.toLocaleString("sr-RS", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} din`;
}

function formatBelgradeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("sr-RS", {
    timeZone: BELGRADE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}
