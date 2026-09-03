"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AdminSession } from "@/components/admin/AdminSession";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminShell } from "@/components/admin/AdminShell";

/**
 * Layout del panel `/administracion`. Estructura propia de back-office (sidebar + topbar),
 * separada de la UX de la app. `/administracion/login` queda fuera del guard y del shell.
 *
 * Nota: este subárbol sigue montado bajo el layout raíz; `SyncProvider` no
 * arranca el motor de la app en rutas `/administracion` (ver src/components/SyncProvider).
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const isLogin = pathname === "/administracion/login";

  return (
    <AdminSession>
      {isLogin ? (
        children
      ) : (
        <AdminGuard>
          <AdminShell>{children}</AdminShell>
        </AdminGuard>
      )}
    </AdminSession>
  );
}
