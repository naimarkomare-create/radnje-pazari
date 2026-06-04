"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/app/actions";

export type DashboardNavItem = {
  href: string;
  label: string;
};

export function DashboardShell({
  title,
  subtitle,
  navigation,
  children
}: {
  title: string;
  subtitle: string;
  navigation: DashboardNavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-market lg:grid lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="hidden border-r border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:flex lg:w-[250px] lg:flex-col">
        <SidebarContent
          navigation={navigation}
          pathname={pathname}
          subtitle={subtitle}
          title={title}
        />
      </aside>

      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Zatvori meni"
            className="absolute inset-0 bg-slate-950/35"
            onClick={() => setMenuOpen(false)}
            type="button"
          />
          <aside className="relative flex h-full w-[min(84vw,300px)] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
              <span className="font-bold text-ink">Meni</span>
              <button
                aria-label="Zatvori meni"
                className="flex size-11 items-center justify-center rounded-md border border-slate-300 bg-white text-xl text-slate-700"
                onClick={() => setMenuOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <SidebarContent
              navigation={navigation}
              onNavigate={() => setMenuOpen(false)}
              pathname={pathname}
              subtitle={subtitle}
              title={title}
            />
          </aside>
        </div>
      ) : null}

      <div className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
          <button
            aria-label="Otvori meni"
            className="flex size-11 items-center justify-center rounded-md border border-slate-300 bg-white text-xl text-slate-700"
            onClick={() => setMenuOpen(true)}
            type="button"
          >
            ☰
          </button>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase text-leaf">Meni</p>
            <p className="truncate font-bold text-ink">{title}</p>
          </div>
        </header>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  title,
  subtitle,
  navigation,
  pathname,
  onNavigate
}: {
  title: string;
  subtitle: string;
  navigation: DashboardNavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="border-b border-slate-200 px-5 py-5">
        <p className="text-lg font-bold text-ink">{title}</p>
        <p className="mt-1 truncate text-sm text-slate-500">{subtitle}</p>
      </div>
      <nav aria-label="Meni" className="flex-1 space-y-1 overflow-y-auto p-3">
        {navigation.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/store" && item.href !== "/admin" && pathname.startsWith(`${item.href}/`));

          return (
            <Link
              className={`block min-h-11 rounded-md px-3 py-3 text-sm font-semibold transition ${
                active ? "bg-leaf text-white" : "text-slate-700 hover:bg-slate-100"
              }`}
              href={item.href}
              key={item.href}
              onClick={onNavigate}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <form action={signOut} className="border-t border-slate-200 p-3">
        <button className="button-secondary w-full" type="submit">
          Odjavi se
        </button>
      </form>
    </>
  );
}
