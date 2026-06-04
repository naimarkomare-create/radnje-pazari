import { DashboardShell, type DashboardNavItem } from "@/components/DashboardShell";
import { requireAdmin } from "@/lib/auth";

const navigation: DashboardNavItem[] = [
  { href: "/admin", label: "Početna" },
  { href: "/admin/pazari", label: "Pazari" },
  { href: "/admin/temperature", label: "Temperature" },
  { href: "/admin/trebovanja", label: "Trebovanja" },
  { href: "/admin/status", label: "Poslato / nije poslato" },
  { href: "/admin/radnje", label: "Radnje" }
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAdmin();

  return (
    <DashboardShell navigation={navigation} subtitle="Administracija" title="Admin pregled">
      {children}
    </DashboardShell>
  );
}
