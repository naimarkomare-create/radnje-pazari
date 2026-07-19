import { NextResponse } from "next/server";
import { getCurrentProfileWithClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const profile = await getCurrentProfileWithClient(supabase);

  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (profile.role !== "admin") {
    return NextResponse.json(
      { error: "Nemate dozvolu za brisanje najave povrata." },
      { status: 403 }
    );
  }

  if (!UUID_PATTERN.test(params.id)) {
    return NextResponse.json(
      { error: "Najava povrata nije pronađena." },
      { status: 404 }
    );
  }

  const { data: proposal, error: proposalError } = await supabase
    .from("return_proposals")
    .select("id")
    .eq("id", params.id)
    .maybeSingle();

  if (proposalError) {
    console.error("Return proposal lookup before deletion failed.", {
      code: proposalError.code
    });
    return NextResponse.json(
      { error: "Najava povrata nije obrisana. Pokušajte ponovo." },
      { status: 500 }
    );
  }

  if (!proposal) {
    return NextResponse.json(
      { error: "Najava povrata nije pronađena." },
      { status: 404 }
    );
  }

  const { data: deletedProposal, error: deleteError } = await supabase
    .from("return_proposals")
    .delete()
    .eq("id", params.id)
    .select("id")
    .maybeSingle();

  if (deleteError) {
    console.error("Return proposal deletion failed.", {
      code: deleteError.code
    });
    return NextResponse.json(
      { error: "Najava povrata nije obrisana. Pokušajte ponovo." },
      { status: 500 }
    );
  }

  if (!deletedProposal) {
    return NextResponse.json(
      { error: "Najava povrata nije pronađena." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    deletedProposalId: deletedProposal.id,
    message: "Najava povrata je obrisana.",
    success: true
  });
}
