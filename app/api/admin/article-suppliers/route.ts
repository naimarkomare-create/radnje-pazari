import { readJsonObject } from "@/lib/security/validation";
import { NextRequest, NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authClient = createClient();
  const authorization = await authorizeApi(authClient, true);
  if (!authorization.ok) return authorization.response;


  const body = await readJsonObject(request);
  const articleId = Number(body?.article_id);
  const supplierId = typeof body?.supplier_id === "string" ? body.supplier_id : "";
  const isPrimary = body?.is_primary === true;

  if (!Number.isSafeInteger(articleId) || articleId <= 0) {
    return NextResponse.json({ error: "ArticleID nije ispravan." }, { status: 400 });
  }
  if (!isUuid(supplierId)) {
    return NextResponse.json({ error: "Dobavljač nije ispravan." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const [articleResult, supplierResult] = await Promise.all([
    supabase
      .from("biznisoft_stock_price_current")
      .select("article_id")
      .eq("article_id", articleId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("biznisoft_suppliers")
      .select("id, biznisoft_partner_id, name")
      .eq("id", supplierId)
      .eq("is_active", true)
      .maybeSingle()
  ]);

  if (articleResult.error || supplierResult.error) {
    console.error(
      "Permanent supplier mapping lookup failed:",
      articleResult.error?.message ?? supplierResult.error?.message
    );
    return NextResponse.json({ error: "Veza nije mogla da bude proverena." }, { status: 500 });
  }
  if (!articleResult.data) {
    return NextResponse.json({ error: "Artikal nije pronađen." }, { status: 404 });
  }
  if (!supplierResult.data) {
    return NextResponse.json({ error: "Aktivan dobavljač nije pronađen." }, { status: 404 });
  }

  if (isPrimary) {
    const { error } = await supabase
      .from("article_suppliers")
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq("article_id", articleId)
      .neq("supplier_id", supplierId);

    if (error) {
      console.error("Primary supplier reset failed:", error.message);
      return NextResponse.json({ error: "Primarni dobavljač nije sačuvan." }, { status: 500 });
    }
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("article_suppliers").upsert(
    {
      article_id: articleId,
      biznisoft_article_id: String(articleId),
      is_primary: isPrimary,
      relation_source: "manual_admin",
      supplier_id: supplierId,
      synced_at: now,
      updated_at: now
    },
    { onConflict: "article_id,supplier_id" }
  );

  if (error) {
    console.error("Permanent supplier mapping failed:", error.message);
    return NextResponse.json({ error: "Veza nije sačuvana." }, { status: 500 });
  }

  return NextResponse.json({
    relation: {
      articleId,
      isPrimary,
      relationSource: "manual_admin",
      supplier: {
        id: supplierResult.data.id,
        name: supplierResult.data.name,
        partnerId: supplierResult.data.biznisoft_partner_id
      }
    }
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
