"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
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
  const menu = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) menu.current?.close(); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => { menu.current?.close(); }, [pathname]);

  return (
    <div className="min-h-screen bg-market lg:grid lg:grid-cols-[250px_minmax(0,1fr)]">
      <a className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:p-3 focus:font-semibold focus:text-leaf" href="#main-content">Pređi na sadržaj</a>
      <aside className="hidden border-r border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:flex lg:w-[250px] lg:flex-col">
        <SidebarContent
          navigation={navigation}
          pathname={pathname}
          subtitle={subtitle}
          title={title}
        />
      </aside>

      <dialog
        aria-labelledby="dashboard-menu-title"
        className="fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-none w-[min(84vw,300px)] max-w-none bg-white p-0 shadow-xl backdrop:bg-slate-950/35"
        id="dashboard-menu"
        onClick={(event) => { if (event.target === event.currentTarget) menu.current?.close(); }}
        ref={menu}
      >
        <aside className="flex h-full flex-col bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
            <span className="font-bold text-ink" id="dashboard-menu-title">Meni</span>
            <button
              aria-label="Zatvori meni"
              className="flex size-11 items-center justify-center rounded-md border border-slate-300 bg-white text-xl text-slate-700"
              onClick={() => menu.current?.close()}
              type="button"
            >
              ×
            </button>
          </div>
          <SidebarContent
            navigation={navigation}
            onNavigate={() => menu.current?.close()}
            pathname={pathname}
            subtitle={subtitle}
            title={title}
          />
        </aside>
      </dialog>

      <div className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
          <button
            aria-controls="dashboard-menu"
            aria-haspopup="dialog"
            aria-label="Otvori meni"
            className="flex size-11 items-center justify-center rounded-md border border-slate-300 bg-white text-xl text-slate-700"
            onClick={() => menu.current?.showModal()}
            type="button"
          >
            ☰
          </button>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase text-leaf">Meni</p>
            <p className="truncate font-bold text-ink">{title}</p>
          </div>
        </header>
        <main className="min-w-0" id="main-content" tabIndex={-1}>{children}</main>
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
  const activeHref = navigation.reduce((match, { href }) => {
    const active = pathname === href || (href !== "/store" && href !== "/admin" && pathname.startsWith(`${href}/`));
    return active && href.length > match.length ? href : match;
  }, "");

  return (
    <>
      <div className="border-b border-slate-200 px-5 py-5">
        <p className="text-lg font-bold text-ink">{title}</p>
        <p className="mt-1 truncate text-sm text-slate-500">{subtitle}</p>
      </div>
      <nav aria-label="Meni" className="flex-1 space-y-1 overflow-y-auto p-3">
        {navigation.map((item) => {
          const active = activeHref === item.href;

          return (
            <Link
              aria-current={active ? "page" : undefined}
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
