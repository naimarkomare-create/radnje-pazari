import { NextRequest, NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api";
import { isIsoDate, isUuid, numericValue } from "@/lib/popis-otpis";
import { lookupWriteoffArticles } from "@/lib/biznisoft/writeoff-lookup";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    if (!Number.isInteger(storageId) || storageId <= 0) return NextResponse.json({ error: "Nije podešen BizniSoft StorageID za ovu radnju." }, { status: 409 });

    const barcode = typeof body.barcode === "string" ? body.barcode.trim() : "";
    if (!barcode || barcode.length > 80) return NextResponse.json({ error: "Barkod nije ispravan." }, { status: 400 });
    const stock = (await lookupWriteoffArticles(storageId, barcode, { articleId })).find((row) => row.article_id === articleId);
    if (!stock) return NextResponse.json({ error: "Identitet artikla i barkod nisu potvrđeni u katalogu." }, { status: 409 });
    const item = {
      account: stock.account,
      article_code: stock.article_code,
      article_id: articleId,
      article_name: stock.article_name,
      barcode: stock.barcode,
      client_entry_id: clientEntryId,
      created_by: authorization.profile.id,
      expiration_date: expirationDate,
      level_price: stock.level_price,
      modify_time: stock.modify_time,
      operator_name: stock.operator_name,
      popdv_id: stock.popdv_id,
      price: stock.price,
      quantity,
      stock_amount: stock.stock_amount,
      stock_fetched_at: stock.stock_fetched_at,
      supplier_id: supplierId,
      supplier_name: listResult.data.supplier_name,
      store_id: listResult.data.store_id,
      unit: stock.unit,
      vat_transaction_type: stock.vat_transaction_type,
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
