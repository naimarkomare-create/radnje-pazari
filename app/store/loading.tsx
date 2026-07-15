export default function StoreLoading() {
  return (
    <main className="page-content" aria-busy="true" aria-live="polite">
      <div className="h-8 w-48 animate-pulse rounded-md bg-slate-200" />
      <div className="h-28 animate-pulse rounded-lg border border-slate-200 bg-white" />
      <p className="text-sm font-medium text-slate-500">Učitavanje...</p>
    </main>
  );
}
