"use client";

import type { ReactNode } from "react";
import { AppBar } from "./AppBar";
import { SyncBanner } from "./SyncBanner";

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
    // Alto mínimo estable: `svh` (viewport chico) no cambia al abrir/cerrar el
    // teclado ni al mostrarse/ocultarse la barra del navegador, así no hay
    // saltos de layout tras navegar (p. ej. al crear un grupo). `min-h-screen`
    // queda de fallback para navegadores sin `svh`.
    <div className="mx-auto flex min-h-screen min-h-[100svh] w-full max-w-app flex-col bg-bg">
      <AppBar title={title} back={back} menu={menu} showSync={showSync} />
      <main className="flex flex-1 flex-col gap-5 px-4 py-5">
        {showSync ? <SyncBanner /> : null}
        {children}
      </main>
      {bottomNav}
    </div>
  );
}
