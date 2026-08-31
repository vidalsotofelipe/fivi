"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
      aria-label={t("primaryNav")}
      className="sticky bottom-0 z-30 mt-auto border-t border-border bg-bg/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-app">
        {items.map(({ dest, href, match }) => {
          const active = match(pathname);
          return (
            <li key={dest} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-touch flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium",
                  active ? "text-accent" : "text-muted hover:text-text",
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
