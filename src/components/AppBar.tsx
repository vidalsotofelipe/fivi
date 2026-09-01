"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SyncBadge } from "./SyncBadge";

/**
 * Barra superior: volver opcional, título, estado de sync y slot de menú.
 * Sticky, respeta el ancho del contenedor.
 */
export function AppBar({
  title,
  back,
  menu,
  showSync = true,
}: {
  title?: ReactNode;
  /** href para volver, o `true` para usar el historial. */
  back?: string | true;
  /** Normalmente un `IconButton` que abre un `BottomSheet`. */
  menu?: ReactNode;
  showSync?: boolean;
}) {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b-2 border-border-strong bg-bg/95 px-2 backdrop-blur">
      {back ? (
        back === true ? (
          <button
            onClick={() => router.back()}
            aria-label={t("back")}
            className="flex h-11 w-11 shrink-0 items-center justify-center text-xl text-text hover:bg-accent-weak"
          >
            <span aria-hidden="true">←</span>
          </button>
        ) : (
          <Link
            href={back}
            aria-label={t("back")}
            className="flex h-11 w-11 shrink-0 items-center justify-center text-xl text-text hover:bg-accent-weak"
          >
            <span aria-hidden="true">←</span>
          </Link>
        )
      ) : (
        <span className="w-2 shrink-0" />
      )}

      <h1 className="min-w-0 flex-1 truncate px-1 text-base font-bold text-text">
        {title}
      </h1>

      {showSync ? <SyncBadge /> : null}
      {menu ? <span className="shrink-0">{menu}</span> : null}
    </header>
  );
}
