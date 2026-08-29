"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { SyncBadge } from "./SyncBadge";

/**
 * Contenedor mobile-first con barra superior (sección 27). Ancho máximo tipo
 * teléfono, barra fija con volver + título + estado de sincronización discreto.
 */
export function AppShell({
  title,
  back,
  children,
}: {
  title?: string;
  /** href para volver, o `true` para usar el historial del navegador. */
  back?: string | true;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-black/5 bg-[#fafafa]/90 px-3 backdrop-blur dark:border-white/10 dark:bg-[#0b0b0c]/90">
        {back ? (
          back === true ? (
            <button
              onClick={() => router.back()}
              aria-label="Volver"
              className="-ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-xl hover:bg-black/5 dark:hover:bg-white/10"
            >
              ‹
            </button>
          ) : (
            <Link
              href={back}
              aria-label="Volver"
              className="-ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-xl hover:bg-black/5 dark:hover:bg-white/10"
            >
              ‹
            </Link>
          )
        ) : (
          <span className="w-2" />
        )}
        <h1 className="flex-1 truncate text-base font-semibold">{title}</h1>
        <SyncBadge />
      </header>

      <main className="flex flex-1 flex-col gap-5 px-4 py-5">{children}</main>
    </div>
  );
}
