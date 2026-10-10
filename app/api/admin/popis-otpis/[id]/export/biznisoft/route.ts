import { NextRequest, NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api";
import { buildBizniSoftWriteoffWorkbook, buildVerifiedBizniSoftTestExport, validateBizniSoftWriteoffPrices } from "@/lib/popis-otpis-export";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { excelDownloadResponse } from "@/lib/excel-templates";
import { formatBizniSoftArticleCode, isUuid, validateWriteoffItems, type ImportableWriteoffItem } from "@/lib/popis-otpis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeApi(createClient(), true);
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Popis nije pronađen." }, { status: 404 });
  const mode = request.nextUrl.searchParams.get("mode");
  if (mode !== null && mode !== "test" && mode !== "production") {
    return NextResponse.json({ error: "Izabrani način izvoza nije ispravan." }, { status: 400 });
  }
  const testOnly = mode !== "production";
  try {
    const supabase = createServiceClient();
    const [listResult, itemResult] = await Promise.all([
      supabase.from("writeoff_lists").select("id, reference, status, store_id, supplier_id, stores(name)").eq("id", id).single(),
      supabase.from("writeoff_list_items").select("*").eq("writeoff_list_id", id).order("created_at", { ascending: true })
    ]);
    if (listResult.error || !listResult.data) return NextResponse.json({ error: "Popis nije pronađen." }, { status: 404 });
    if (listResult.data.status !== "finalized") return NextResponse.json({ error: "Prvo završite i zaključajte popis." }, { status: 409 });
    if (itemResult.error) throw itemResult.error;
    const store = Array.isArray(listResult.data.stores) ? listResult.data.stores[0] : listResult.data.stores;
    const items = (itemResult.data ?? []).map((item) => ({ ...item, store_name: store?.name ?? "" })) as ImportableWriteoffItem[];
    if (items.some((item) => item.store_id !== listResult.data.store_id || item.supplier_id !== listResult.data.supplier_id)) {
      return NextResponse.json({ error: "Sačuvane stavke nisu usaglašene sa radnjom i dobavljačem." }, { status: 422 });
    }
    const priceError = validateBizniSoftWriteoffPrices(items);
    if (priceError) return NextResponse.json({ error: priceError, code: "PRICE_UNAVAILABLE" }, { status: 422 });
    if (testOnly) {
      const buffer = await buildVerifiedBizniSoftTestExport(items);
      const name = `PROBNI-biznisoft-otpis-${String(listResult.data.reference).replace(/[^a-zA-Z0-9_-]/g, "-")}.xlsx`;
      return new NextResponse(new Uint8Array(buffer), { headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "X-Writeoff-Mode": "test"
      } });
    }
    const basicErrors = validateWriteoffItems(items, { requireBizniSoftMetadata: false });
    const accountingErrors = validateWriteoffItems(items.map((item) => ({ ...item, article_code: item.article_code?.trim() || formatBizniSoftArticleCode(item.article_id) })));
    if (basicErrors.length === 0 && accountingErrors.length > 0) {
      return NextResponse.json({ error: "Nedostaju računovodstveni podaci za produkcijski izvoz. Koristite probni XLSX.", code: "ACCOUNTING_METADATA_MISSING" }, { status: 422 });
    }
    const result = await buildBizniSoftWriteoffWorkbook(items);
    return excelDownloadResponse(result.workbook, `biznisoft-otpis-${listResult.data.reference}.xlsx`);
  } catch (error) {
    const message = error instanceof Error ? error.message.split(/(?<=\.)\s/)[0] : "Izvoz nije uspeo. Pokušajte ponovo.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
