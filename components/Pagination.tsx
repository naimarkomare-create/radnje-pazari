import Link from "next/link";

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
  if (totalPages <= 1 && page === 1) return null;

  return (
    <nav aria-label="Stranice" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <span className="w-full text-center text-slate-600 sm:order-2 sm:w-auto">
        {page > totalPages ? `${totalCount} ukupno` : `${page} / ${totalPages} · ${totalCount} ukupno`}
      </span>
      {page > 1 ? (
        <Link className="button-secondary sm:order-1" href={pageHref(Math.min(totalPages, page - 1), pathname, searchParams, pageParam)} prefetch={false}>
          {page > totalPages ? "Poslednja stranica" : "Prethodna"}
        </Link>
      ) : <span className="hidden sm:order-1 sm:inline" />}
      {page < totalPages ? (
        <Link className="button-secondary ml-auto sm:order-3 sm:ml-0" href={pageHref(page + 1, pathname, searchParams, pageParam)} prefetch={false}>
          Sledeća
        </Link>
      ) : null}
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
