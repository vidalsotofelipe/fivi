"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AppMark } from "./Logo";
import { SyncBadge } from "./SyncBadge";

/**
 * Ícono de ajustes generales de la app (idioma, apariencia, apoyar el
 * proyecto): SIEMPRE presente en el nav superior, en cualquier pantalla — no
 * es una acción de la página actual, así que vive acá y no en el slot `menu`
 * (que es contextual: kebab de un gasto, etc.) ni en una sola pantalla.
 */
function SettingsLink() {
  const { t } = useTranslation();
  return (
    <Link
      href="/ajustes"
      // Nombre accesible completo ("Ajustes generales"), no "Ajustes": la
      // Configuración de un grupo también se llama "Ajustes"/"Settings" en
      // algunas pantallas, y un nombre corto colisionaría con ese link.
      aria-label={t("settings:generalTitle")}
      className="flex h-11 w-11 shrink-0 items-center justify-center border-2 border-transparent text-lg text-text hover:bg-accent-weak"
    >
      <span aria-hidden="true">⚙</span>
    </Link>
  );
}

/**
 * Marca + nombre de la app: SIEMPRE presente (a diferencia de la flecha de
 * volver, que es contextual y puede faltar o apuntar a la pantalla anterior).
 * Es la única navegación que garantiza llegar a la lista de grupos desde
 * cualquier pantalla — la flecha de volver no sirve para eso: en `/ajustes`,
 * por ejemplo, "volver" tiene que devolver al grupo del que viniste, no
 * saltar siempre al inicio.
 *
 * El ícono nunca se oculta. El nombre de texto sí, cuando la pantalla YA tiene
 * un menú contextual propio (hoy sólo el detalle de un gasto): entre volver +
 * marca + título + sync + ese menú + ajustes no entra nada más a 320px sin
 * que el título de la página quede irreconocible. El ícono solo alcanza para
 * volver al inicio; el texto es un refuerzo, no la única vía.
 */
function HomeMark({ compact }: { compact: boolean }) {
  const { t } = useTranslation();
  return (
    <Link
      href="/"
      aria-label={t("appName")}
      className="flex h-11 shrink-0 items-center gap-1.5 px-1 text-text"
    >
      <AppMark className="h-6 w-6 shrink-0" />
      {compact ? null : (
        <span className="text-xs font-bold tracking-tight">{t("appName")}</span>
      )}
    </Link>
  );
}

/**
 * Barra superior: volver contextual opcional, marca de la app (siempre
 * presente, lleva al inicio), título, estado de sync, slot de menú
 * contextual y el ícono de ajustes generales (siempre presente).
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
      ) : null}

      <HomeMark compact={!!menu} />

      <h1 className="min-w-0 flex-1 truncate px-1 text-base font-bold text-text">
        {title}
      </h1>

      {showSync ? <SyncBadge /> : null}
      {menu ? <span className="shrink-0">{menu}</span> : null}
      <SettingsLink />
    </header>
  );
}
