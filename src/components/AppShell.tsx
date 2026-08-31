"use client";

import type { ReactNode } from "react";
import { AppBar } from "./AppBar";

/**
 * Contenedor mobile-first: ancho fluido con tope de 480 px, `padding-inline`
 * fijo, barra superior sticky y, opcionalmente, navegación inferior. Nunca
 * ancho fijo; nunca scroll horizontal a nivel documento (ver globals.css).
 */
export function AppShell({
  title,
  back,
  menu,
  bottomNav,
  showSync = true,
  children,
}: {
  title?: ReactNode;
  back?: string | true;
  /** Slot de menú de la barra superior (kebab → BottomSheet). */
  menu?: ReactNode;
  /** `<BottomNav>` cuando hay grupo activo. */
  bottomNav?: ReactNode;
  showSync?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-app flex-col bg-bg">
      <AppBar title={title} back={back} menu={menu} showSync={showSync} />
      <main className="flex flex-1 flex-col gap-5 px-4 py-5">{children}</main>
      {bottomNav}
    </div>
  );
}
