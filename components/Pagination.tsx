type SearchParams = Record<string, string | string[] | undefined>;

export function Pagination({
  page,
  pageSize,
  pathname,
  searchParams,
  totalCount,
  pageParam = "page"
}: {
  page: number;
  pageSize: number;
  pathname: string;
  searchParams: SearchParams;
  totalCount: number;
  pageParam?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Stranice" className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <a
        aria-disabled={page <= 1}
        className={page <= 1 ? "pointer-events-none text-slate-300" : "font-semibold text-leaf"}
        href={pageHref(Math.max(1, page - 1), pathname, searchParams, pageParam)}
      >
        Prethodna
      </a>
      <span className="text-slate-600">
        {page} / {totalPages} · {totalCount} ukupno
      </span>
      <a
        aria-disabled={page >= totalPages}
        className={page >= totalPages ? "pointer-events-none text-slate-300" : "font-semibold text-leaf"}
        href={pageHref(Math.min(totalPages, page + 1), pathname, searchParams, pageParam)}
      >
        Sledeća
      </a>
    </nav>
  );
}

function pageHref(page: number, pathname: string, searchParams: SearchParams, pageParam: string) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string" && value) params.set(key, value);
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
  }

  if (page > 1) params.set(pageParam, String(page));
  else params.delete(pageParam);

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
