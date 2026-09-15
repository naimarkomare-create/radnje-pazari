import { readJsonObject, publicErrorMessage, isUuid } from "@/lib/security/validation";
import { NextRequest, NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api";
import {
  canEditReturnProposal,
  RETURN_PROPOSAL_ITEM_COLUMNS
} from "@/lib/return-proposals";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import type { ReturnProposal } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const authorization = await authorizeApi(supabase, false);
  if (!authorization.ok) return authorization.response;
  const { profile } = authorization;
  if (!isUuid(params.id)) return NextResponse.json({ error: "Najava nije pronađena." }, { status: 404 });


  const { data: proposalData, error: proposalError } = await supabase
    .from("return_proposals")
    .select("id, store_id, status")
    .eq("id", params.id)
    .single();

  if (proposalError || !proposalData) {
    return NextResponse.json(
      { error: "Najava nije pronađena." },
      { status: 404 }
    );
  }

  const proposal = proposalData as ReturnProposal;
  if (!canEditReturnProposal(profile, proposal)) {
    return NextResponse.json(
      { error: "Najava nije otvorena za izmene." },
      { status: 403 }
    );
  }

  const body = await readJsonObject(request);
  const articleId = Number(body.article_id);
  const quantity = Number(body.quantity);
  const articleName = String(body.article_name ?? "").trim();
  if (body.supplier_id && !isUuid(body.supplier_id)) {
    return NextResponse.json({ error: "Dobavljač nije ispravan." }, { status: 400 });
  }

  if (!Number.isSafeInteger(articleId) || articleId <= 0 || articleId > 2147483647) {
    return NextResponse.json({ error: "ArticleID nije ispravan." }, { status: 400 });
  }
  if (!articleName) {
    return NextResponse.json(
      { error: "Naziv artikla je obavezan." },
      { status: 400 }
    );
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json(
      { error: "Količina mora biti veća od 0." },
      { status: 400 }
    );
  }

  const supplierResult = await resolveSupplierSnapshot(
    articleId,
    typeof body.supplier_id === "string" && body.supplier_id
      ? body.supplier_id
      : null
  );
  if (supplierResult.error) {
    return NextResponse.json(
      { error: supplierResult.error },
      { status: supplierResult.status }
    );
  }

  const { data, error } = await supabase
    .from("return_proposal_items")
    .insert({
      article_id: articleId,
      article_name: articleName,
      barcode: typeof body.barcode === "string" ? body.barcode : null,
      created_by: profile.id,
      note: typeof body.note === "string" ? body.note : null,
      proposal_id: params.id,
      quantity,
      raw_article: {},
      reason: typeof body.reason === "string" ? body.reason : null,
      supplier_id: supplierResult.supplier?.id ?? null,
      supplier_name: supplierResult.supplier?.name ?? null,
      supplier_partner_id: supplierResult.supplier?.partnerId ?? null,
      supplier_relation_source:
        supplierResult.supplier?.relationSource ?? null,
      unit: typeof body.unit === "string" ? body.unit : null,
      updated_by: profile.id
    })
    .select(RETURN_PROPOSAL_ITEM_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: publicErrorMessage(error) }, { status: 500 });

  await Promise.all([
    supabase
      .from("return_proposals")
      .update({ updated_by: profile.id })
      .eq("id", params.id),
    supabase.from("return_proposal_history").insert({
      action: "item_added",
      item_id: data.id,
      new_value: data,
      proposal_id: params.id,
      user_id: profile.id
    })
  ]);

  return NextResponse.json({ item: data }, { status: 201 });
}

type ResolvedSupplier = {
  id: string;
  isPrimary: boolean;
  name: string;
  partnerId: string;
  relationSource: string;
};

async function resolveSupplierSnapshot(
  articleId: number,
  requestedSupplierId: string | null
) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("article_suppliers")
    .select(
      "is_primary, relation_source, supplier_id, supplier:biznisoft_suppliers!inner(id, biznisoft_partner_id, name, is_active)"
    )
    .eq("article_id", articleId)
    .eq("supplier.is_active", true);

  if (error) {
    console.error("Return item supplier validation failed:", error.message);
    return {
      error: "Dobavljač nije mogao da bude proveren.",
      status: 500,
      supplier: null
    };
  }

  const suppliers: ResolvedSupplier[] = [];

  for (const row of data ?? []) {
    const supplier = relationValue(row.supplier);
    if (
      !supplier ||
      typeof supplier.id !== "string" ||
      typeof supplier.biznisoft_partner_id !== "string" ||
      typeof supplier.name !== "string"
    ) {
      continue;
    }

    suppliers.push({
      id: supplier.id,
      isPrimary: row.is_primary === true,
      name: supplier.name,
      partnerId: supplier.biznisoft_partner_id,
      relationSource:
        typeof row.relation_source === "string"
          ? row.relation_source
          : "purchase_calculation"
    });
  }

  suppliers.sort((left, right) => {
    if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
    return left.name.localeCompare(right.name, "sr");
  });

  if (requestedSupplierId) {
    const linkedSupplier = suppliers.find(
      (supplier) => supplier.id === requestedSupplierId
    );
    if (linkedSupplier) {
      return {
        error: null,
        status: 200,
        supplier: linkedSupplier
      };
    }

    const { data: manualSupplier, error: manualSupplierError } = await supabase
      .from("biznisoft_suppliers")
      .select("id, biznisoft_partner_id, name")
      .eq("id", requestedSupplierId)
      .eq("is_active", true)
      .maybeSingle();

    if (manualSupplierError) {
      console.error(
        "Manual return supplier validation failed:",
        manualSupplierError.message
      );
      return {
        error: "Dobavljač nije mogao da bude proveren.",
        status: 500,
        supplier: null
      };
    }
    if (!manualSupplier) {
      return {
        error: "Aktivan dobavljač nije pronađen.",
        status: 400,
        supplier: null
      };
    }

    return {
      error: null,
      status: 200,
      supplier: {
        id: manualSupplier.id,
        isPrimary: false,
        name: manualSupplier.name,
        partnerId: manualSupplier.biznisoft_partner_id,
        relationSource: "manual_selection"
      }
    };
  }

  if (suppliers.length > 1) {
    return {
      error: "Izaberite dobavljača za ovaj artikal.",
      status: 400,
      supplier: null
    };
  }

  return {
    error: null,
    status: 200,
    supplier: suppliers[0] ?? null
  };
}

function relationValue<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
