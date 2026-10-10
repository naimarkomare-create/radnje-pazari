import { NextRequest, NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api";
import { isUuid } from "@/lib/popis-otpis";
import { lookupWriteoffArticles } from "@/lib/biznisoft/writeoff-lookup";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authorization = await authorizeApi(createClient(), true);
  if (!authorization.ok) return authorization.response;
  const storeId = request.nextUrl.searchParams.get("store_id") ?? "";
  const barcode = request.nextUrl.searchParams.get("barcode")?.trim() ?? "";
  const articleParam = request.nextUrl.searchParams.get("article_id");
  const articleId = articleParam === null ? undefined : Number(articleParam);
  if (articleId !== undefined && (!Number.isSafeInteger(articleId) || articleId <= 0)) return NextResponse.json({ error: "Šifra artikla nije ispravna." }, { status: 400 });
  if (!isUuid(storeId) || !barcode || barcode.length > 80) return NextResponse.json({ article: null, candidates: [], error: "Radnja i barkod su obavezni." }, { status: 400 });
  try {
    const store = await createServiceClient().from("stores").select("id, name, biznisoft_storage_id").eq("id", storeId).single();
    if (store.error || !store.data) return NextResponse.json({ article: null, candidates: [], error: "Radnja nije pronađena." }, { status: 404 });
    const storageId = store.data.biznisoft_storage_id;
    if (!Number.isInteger(storageId) || storageId <= 0) return NextResponse.json({ article: null, candidates: [], error: "Nije podešen BizniSoft StorageID za ovu radnju." }, { status: 409 });
    const candidates = await lookupWriteoffArticles(storageId, barcode, { articleId });
    return NextResponse.json({ article: candidates.length === 1 ? candidates[0] : null, candidates,
      error: candidates.length === 0 ? "Barkod nije pronađen u sinhronizovanom katalogu artikala." : null,
      store: { id: store.data.id, name: store.data.name, storage_id: storageId }
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ article: null, candidates: [], error: "Pretraga artikla trenutno nije uspela. Proverite vezu i pokušajte ponovo." }, { status: 503 });
  }
}
