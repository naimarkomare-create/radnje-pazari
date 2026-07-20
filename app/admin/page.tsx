import { TurnoverDashboard } from "@/app/admin/TurnoverDashboard";
import { PageHeader } from "@/components/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { businessDateInBelgrade } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  await requireAdmin();

  return (
    <>
      <PageHeader
        description="Dnevni promet direktno iz BizniSoft-a, po povezanim radnjama."
        eyebrow="Admin pregled"
        title="Promet uživo"
      />
      <TurnoverDashboard
        dayBeforeYesterday={businessDateInBelgrade(-2)}
        today={businessDateInBelgrade()}
        yesterday={businessDateInBelgrade(-1)}
      />
    </>
  );
}
