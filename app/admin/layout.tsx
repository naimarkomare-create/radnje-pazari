import { DashboardShell, type DashboardNavItem } from "@/components/DashboardShell";
import { requireAdmin } from "@/lib/auth";

const navigation: DashboardNavItem[] = [
  { href: "/admin", label: "Promet uživo" },
  { href: "/admin/pazari", label: "Pazari" },
  { href: "/admin/ispravka-pazara", label: "Ispravka pazara" },
  { href: "/admin/temperature", label: "Temperature" },
  { href: "/admin/temperature/uredjaji", label: "Uređaji temperatura" },
  { href: "/admin/trebovanja", label: "Trebovanja" },
  { href: "/admin/kontrola-police", label: "Kontrola voća i povrća" },
  { href: "/admin/mapa", label: "Mapa" },
  { href: "/admin/zadaci", label: "Pošalji zadatak" },
  { href: "/admin/biznisoft-akcije", label: "BizniSoft akcije" },
  { href: "/admin/biznisoft-promene-cena", label: "Promene cena" },
  { href: "/admin/povrati", label: "Najave povrata" }
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <DashboardShell navigation={navigation} subtitle="Administracija" title="Admin pregled">
      {children}
    </DashboardShell>
  );
}
