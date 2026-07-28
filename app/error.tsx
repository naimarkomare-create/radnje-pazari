"use client";

export default function AppError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-ink">Aplikacija trenutno nije dostupna</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Proverite internet vezu i pokušajte ponovo. Vaša prijava nije automatski obrisana.
        </p>
        <button className="button-primary mt-5 w-full" onClick={reset} type="button">
          Pokušaj ponovo
        </button>
      </div>
    </main>
  );
}
