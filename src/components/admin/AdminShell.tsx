"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { appInfo } from "@/lib/appInfo";
import { useTheme, type ThemePref } from "@/components/ThemeProvider";
import { useAdminSession } from "./AdminSession";

const NAV: { href: string; label: string }[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/grupos", label: "Grupos" },
  { href: "/admin/movimientos", label: "Movimientos" },
  { href: "/admin/auditoria", label: "Auditoría" },
  { href: "/admin/estado", label: "Estado" },
  { href: "/admin/configuracion", label: "Configuración" },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";
  return (
    <nav className="flex flex-col" aria-label="Secciones del panel">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-l-2 px-4 py-3 text-sm font-semibold transition-colors",
              active
                ? "border-accent bg-accent-weak text-accent-strong"
                : "border-transparent text-muted hover:bg-surface-raised hover:text-text",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const opts: { v: ThemePref; label: string }[] = [
    { v: "system", label: "Auto" },
    { v: "light", label: "Claro" },
    { v: "dark", label: "Oscuro" },
  ];
  return (
    <div className="flex border border-border" role="group" aria-label="Tema">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => setTheme(o.v)}
          aria-pressed={theme === o.v}
          className={cn(
            "px-2 py-1 text-[11px] font-bold uppercase tracking-caps",
            theme === o.v ? "bg-text text-bg" : "text-muted hover:bg-surface-raised",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const { email, signOut } = useAdminSession();
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Topbar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b-2 border-border-strong bg-surface px-4 py-2">
        <button
          type="button"
          className="min-h-touch min-w-touch border border-border md:hidden"
          aria-label={drawer ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={drawer}
          onClick={() => setDrawer((d) => !d)}
        >
          {drawer ? "✕" : "☰"}
        </button>
        <span className="font-display text-lg font-bold tracking-tightest">
          FIVI <span className="text-muted">· Admin</span>
        </span>
        <span
          className="border border-border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-caps text-muted"
          title="Entorno de ejecución"
        >
          {appInfo.environment}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          {email ? <span className="hidden text-xs text-muted sm:inline">{email}</span> : null}
          <button
            type="button"
            onClick={() => void signOut()}
            className="min-h-touch border border-border-strong px-3 text-sm font-semibold hover:bg-surface-raised"
          >
            Salir
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1200px]">
        {/* Sidebar (desktop) */}
        <aside className="hidden w-56 shrink-0 border-r border-border md:block">
          <div className="sticky top-[49px]">
            <NavList />
          </div>
        </aside>

        {/* Drawer (mobile) */}
        {drawer ? (
          <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menú">
            <div className="absolute inset-0 bg-text/40" onClick={() => setDrawer(false)} />
            <div className="absolute left-0 top-0 h-full w-64 border-r-2 border-border-strong bg-surface pt-2">
              <NavList onNavigate={() => setDrawer(false)} />
            </div>
          </div>
        ) : null}

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
