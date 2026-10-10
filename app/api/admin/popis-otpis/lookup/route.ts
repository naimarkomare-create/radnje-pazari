import { NextRequest, NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api";
import { formatBizniSoftArticleCode, isUuid, readRawField, textValue } from "@/lib/popis-otpis";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authorization = await authorizeApi(createClient(), true);
  if (!authorization.ok) return authorization.response;
  const storeId = request.nextUrl.searchParams.get("store_id") ?? "";
  const barcode = request.nextUrl.searchParams.get("barcode")?.trim() ?? "";
  if (!isUuid(storeId) || !barcode || barcode.length > 80) {
    return NextResponse.json({ article: null, candidates: [], error: "Radnja i barkod su obavezni." }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const storeResult = await supabase.from("stores").select("id, name, biznisoft_storage_id").eq("id", storeId).single();
    if (storeResult.error || !storeResult.data) return NextResponse.json({ article: null, candidates: [], error: "Radnja nije pronađena." }, { status: 404 });
    const storageId = storeResult.data.biznisoft_storage_id;
    if (!Number.isInteger(storageId)) {
      return NextResponse.json({ article: null, candidates: [], error: "Nije podešen BizniSoft StorageID za ovu radnju." }, { status: 409 });
    }

    const stockResult = await supabase
      .from("biznisoft_stock_price_current")
      .select("storage_id, storage_key, article_id, name, barcode, unit, amount, retail_price, last_seen_at, raw")
      .eq("storage_key", String(storageId))
      .eq("barcode", barcode)
      .order("last_seen_at", { ascending: false })
      .limit(20);
    if (stockResult.error) throw stockResult.error;
    const stockRows = stockResult.data ?? [];
    const articleIds = Array.from(new Set(stockRows.map((row) => row.article_id)));
    const articleResult = articleIds.length
      ? await supabase.from("biznisoft_articles").select("article_id, article_code, raw").in("article_id", articleIds)
      : { data: [], error: null };
    if (articleResult.error) throw articleResult.error;
    const articleCache = new Map((articleResult.data ?? []).map((row) => [row.article_id, row]));
    const relationResult = articleIds.length
      ? await supabase
          .from("article_suppliers")
          .select("article_id, is_primary, supplier:biznisoft_suppliers!inner(id, name, is_active)")
          .in("article_id", articleIds)
          .eq("supplier.is_active", true)
      : { data: [], error: null };
    if (relationResult.error) throw relationResult.error;
    const suppliers = new Map<number, Array<{ id: string; name: string; is_primary: boolean }>>();
    for (const row of relationResult.data ?? []) {
      const supplier = Array.isArray(row.supplier) ? row.supplier[0] : row.supplier;
      if (!supplier || typeof supplier.id !== "string" || typeof supplier.name !== "string") continue;
      const list = suppliers.get(row.article_id) ?? [];
      list.push({ id: supplier.id, name: supplier.name, is_primary: row.is_primary === true });
      suppliers.set(row.article_id, list);
    }

    const candidates = stockRows.map((row) => {
      const cached = articleCache.get(row.article_id);
      const stockRaw = (row.raw ?? {}) as Record<string, unknown>;
      const articleRaw = (cached?.raw ?? {}) as Record<string, unknown>;
      return {
        account: textValue(readRawField({ ...articleRaw, ...stockRaw }, ["Account", "Konto"])),
        article_code: textValue(cached?.article_code) ?? textValue(readRawField({ ...articleRaw, ...stockRaw }, ["Code", "ArticleCode", "CatNo", "ArticleCatNo"])) ?? formatBizniSoftArticleCode(row.article_id),
        article_id: row.article_id,
        article_name: row.name ?? "",
        barcode: row.barcode,
        level_price: Number(readRawField({ ...articleRaw, ...stockRaw }, ["LevelPrice", "NivCena", "NivPrice"])) || null,
        modify_time: textValue(readRawField({ ...articleRaw, ...stockRaw }, ["ModifyTime", "ModificationTime"])),
        name: row.name ?? `Nepoznat artikal (ID: ${row.article_id})`,
        operator_name: textValue(readRawField({ ...articleRaw, ...stockRaw }, ["Operater", "Operator"])),
        popdv_id: textValue(readRawField({ ...articleRaw, ...stockRaw }, ["POPDVID", "POPDVId", "POPDV_ID", "PdvId"])),
        price: row.retail_price,
        stock_amount: row.amount,
        stock_fetched_at: row.last_seen_at,
        suppliers: suppliers.get(row.article_id) ?? [],
        unit: row.unit
      };
    });
    const distinct = Array.from(new Map(candidates.map((row) => [row.article_id, row])).values());
    return NextResponse.json({
      article: distinct.length === 1 ? distinct[0] : null,
      candidates: distinct,
      error: distinct.length === 0 ? "Artikal nije pronađen u stanju izabrane radnje." : null,
      store: { id: storeResult.data.id, name: storeResult.data.name, storage_id: storageId }
    });
  } catch {
    return NextResponse.json({ article: null, candidates: [], error: "Pretraga artikla trenutno nije uspela." }, { status: 500 });
  }
}
