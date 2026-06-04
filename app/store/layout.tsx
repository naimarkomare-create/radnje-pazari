import { DashboardShell, type DashboardNavItem } from "@/components/DashboardShell";
import { requireStore } from "@/lib/auth";

const navigation: DashboardNavItem[] = [
  { href: "/store", label: "Početna" },
  { href: "/store/pazari", label: "Dnevni pazar" },
  { href: "/store/temperature", label: "Temperature" },
  { href: "/store/trebovanja", label: "Trebovanja" },
  { href: "/store/moji-unosi", label: "Moji unosi" }
];

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireStore();

  return (
    <DashboardShell
      navigation={navigation}
      subtitle="Korisnik radnje"
      title={profile.stores?.name ?? "Radnja"}
    >
      {children}
    </DashboardShell>
  );
}
