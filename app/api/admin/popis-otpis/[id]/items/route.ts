import { NextRequest, NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api";
import { formatBizniSoftArticleCode, isIsoDate, isUuid, numericValue, readRawField, textValue } from "@/lib/popis-otpis";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeApi(createClient(), true);
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Popis nije pronađen." }, { status: 404 });
  try {
    const body = await request.json();
    const clientEntryId = typeof body.client_entry_id === "string" ? body.client_entry_id : "";
    const supplierId = typeof body.supplier_id === "string" ? body.supplier_id : "";
    const articleId = numericValue(body.article_id);
    const quantity = numericValue(body.quantity);
    const expirationDate = body.expiration_date;
    if (!isUuid(clientEntryId) || !isUuid(supplierId) || articleId === null || !Number.isInteger(articleId) || quantity === null || quantity <= 0 || !isIsoDate(expirationDate)) {
      return NextResponse.json({ error: "Artikal, dobavljač, količina i rok trajanja moraju biti ispravni." }, { status: 400 });
    }
    const supabase = createServiceClient();
    const listResult = await supabase.from("writeoff_lists").select("id, store_id, supplier_id, supplier_name, status, stores(id, name, biznisoft_storage_id)").eq("id", id).single();
    if (listResult.error || !listResult.data) return NextResponse.json({ error: "Popis nije pronađen." }, { status: 404 });
    if (listResult.data.status !== "draft") return NextResponse.json({ error: "Popis je već završen i zaključan." }, { status: 409 });
    if (listResult.data.supplier_id !== supplierId) return NextResponse.json({ error: "Izabrani dobavljač ne odgovara popisu." }, { status: 400 });
    const store = Array.isArray(listResult.data.stores) ? listResult.data.stores[0] : listResult.data.stores;
    const storageId = store?.biznisoft_storage_id;
    if (!Number.isInteger(storageId)) return NextResponse.json({ error: "Nije podešen BizniSoft StorageID za ovu radnju." }, { status: 409 });

    const stockResult = await supabase.from("biznisoft_stock_price_current").select("storage_id, article_id, name, barcode, unit, amount, retail_price, last_seen_at, raw").eq("storage_key", String(storageId)).eq("article_id", articleId).limit(3);
    if (stockResult.error) throw stockResult.error;
    const barcode = typeof body.barcode === "string" ? body.barcode.trim() : "";
    const stock = (stockResult.data ?? []).find((row) => row.barcode === barcode) ?? null;
    if (!stock) return NextResponse.json({ error: "Artikal nije potvrđen u stanju izabrane radnje." }, { status: 409 });
    const articleCache = await supabase.from("biznisoft_articles").select("article_code, raw").eq("article_id", articleId).maybeSingle();
    if (articleCache.error) throw articleCache.error;
    const stockRaw = (stock.raw ?? {}) as Record<string, unknown>;
    const articleRaw = (articleCache.data?.raw ?? {}) as Record<string, unknown>;
    const mergedRaw = { ...articleRaw, ...stockRaw };
    const item = {
      account: textValue(readRawField(mergedRaw, ["Account", "Konto"])),
      article_code: textValue(articleCache.data?.article_code) ?? textValue(readRawField(mergedRaw, ["Code", "ArticleCode", "CatNo", "ArticleCatNo"])) ?? formatBizniSoftArticleCode(articleId),
      article_id: articleId,
      article_name: stock.name ?? `Nepoznat artikal (ID: ${articleId})`,
      barcode: stock.barcode,
      client_entry_id: clientEntryId,
      created_by: authorization.profile.id,
      expiration_date: expirationDate,
      level_price: numericValue(readRawField(mergedRaw, ["LevelPrice", "NivCena", "NivPrice"])),
      modify_time: textValue(readRawField(mergedRaw, ["ModifyTime", "ModificationTime"])),
      operator_name: textValue(readRawField(mergedRaw, ["Operater", "Operator"])),
      popdv_id: textValue(readRawField(mergedRaw, ["POPDVID", "POPDVId", "POPDV_ID", "PdvId"])),
      price: stock.retail_price,
      quantity,
      stock_amount: stock.amount,
      stock_fetched_at: stock.last_seen_at,
      supplier_id: supplierId,
      supplier_name: listResult.data.supplier_name,
      store_id: listResult.data.store_id,
      unit: stock.unit,
      vat_transaction_type: textValue(readRawField(mergedRaw, ["VATTransactionType", "VatTransactionType", "TaxTransactionType", "VrstaPDVPrometa"])),
      writeoff_list_id: id
    };
    const result = await supabase.from("writeoff_list_items").insert(item).select("id, writeoff_list_id, client_entry_id, store_id, supplier_id, article_id, article_code, barcode, article_name, unit, quantity, expiration_date, stock_amount, stock_fetched_at, price, level_price, account, popdv_id, vat_transaction_type, operator_name, modify_time, supplier_name, created_by, created_at, updated_at").single();
    if (result.error) {
      if (result.error.code === "23505") {
        const existing = await supabase.from("writeoff_list_items").select("*").eq("client_entry_id", clientEntryId).single();
        if (existing.data) return NextResponse.json({ item: existing.data, duplicate: true });
      }
      throw result.error;
    }
    return NextResponse.json({ item: result.data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Stavka nije sačuvana. Proverite unos i pokušajte ponovo." }, { status: 500 });
  }
}
