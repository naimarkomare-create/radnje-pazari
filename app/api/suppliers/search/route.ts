import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfileWithClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authClient = createClient();
  const profile = await getCurrentProfileWithClient(authClient);

  if (!profile) {
    return NextResponse.json({ error: "Unauthorized", suppliers: [] }, { status: 401 });
  }

  const query = sanitizeSearch(request.nextUrl.searchParams.get("q") ?? "");
  if (query.length < 2) {
    return NextResponse.json({ error: null, suppliers: [] });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("biznisoft_suppliers")
    .select("id, biznisoft_partner_id, name")
    .eq("is_active", true)
    .ilike("name", `%${query}%`)
    .order("name")
    .limit(20);

  if (error) {
    console.error("Supplier search failed:", error.message);
    return NextResponse.json(
      { error: "Pretraga dobavljača nije uspela.", suppliers: [] },
      { status: 500 }
    );
  }

  return NextResponse.json({
    error: null,
    suppliers: (data ?? []).map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      partnerId: supplier.biznisoft_partner_id
    }))
  });
}

function sanitizeSearch(value: string) {
  return value.trim().replace(/[%_]/g, "").slice(0, 80);
}
