"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

type Dest = "summary" | "expenses" | "people" | "more";

const ICONS: Record<Dest, string> = {
  summary: "◈",
  expenses: "≣",
  people: "◉",
  more: "···",
};

/**
 * Navegación inferior fija (4 destinos, labels siempre visibles). Sólo se
 * renderiza con un grupo activo. Respeta el safe-area.
 */
export function BottomNav({ groupId }: { groupId: string }) {
  const { t } = useTranslation("nav");
  const pathname = usePathname();
  const baseHref = `/g/${groupId}`;
  const navRef = useRef<HTMLElement>(null);

  // Publica el alto real del menú (incluye borde + safe-area) para que otros
  // elementos fijos —el toast— se posicionen por encima y no lo tapen.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const root = document.documentElement;
    const apply = () =>
      root.style.setProperty("--fivi-bottomnav", `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--fivi-bottomnav");
    };
  }, []);

  const items: { dest: Dest; href: string; match: (p: string) => boolean }[] = [
    {
      dest: "summary",
      href: baseHref,
      match: (p) => p === baseHref,
    },
    {
      dest: "expenses",
      href: `${baseHref}/gastos`,
      match: (p) => p.startsWith(`${baseHref}/gastos`),
    },
    {
      dest: "people",
      href: `${baseHref}/personas`,
      match: (p) => p.startsWith(`${baseHref}/personas`),
    },
    {
      dest: "more",
      href: `${baseHref}/mas`,
      match: (p) =>
        p.startsWith(`${baseHref}/mas`) ||
        p.startsWith(`${baseHref}/config`) ||
        p.startsWith(`${baseHref}/actividad`),
    },
  ];

  return (
    <nav
      ref={navRef}
      aria-label={t("primaryNav")}
      className="sticky bottom-0 z-30 mt-auto border-t-2 border-border-strong bg-bg/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-app">
        {items.map(({ dest, href, match }, i) => {
          const active = match(pathname);
          return (
            <li key={dest} className={cn("flex-1", i > 0 && "border-l-2 border-border")}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-touch flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-bold uppercase tracking-caps",
                  active
                    ? "bg-accent-weak text-accent-strong"
                    : "text-faint hover:text-text",
                )}
              >
                <span aria-hidden="true" className="text-base leading-none">
                  {ICONS[dest]}
                </span>
                {t(dest)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
