export function PageHeader({
  eyebrow,
  title,
  description
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        <p className="text-sm font-semibold text-leaf">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold text-ink">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm text-slate-600">{description}</p> : null}
      </div>
    </header>
  );
}
