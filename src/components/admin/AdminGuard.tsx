"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAdminSession } from "./AdminSession";
import { useApi } from "./useApi";
import { Button, Skeleton } from "./ui";

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6 text-center text-text">
      <div className="max-w-md">{children}</div>
    </div>
  );
}

/**
 * Puerta del panel. Es defensa de UX: la seguridad real vive en cada endpoint
 * (`requireAdmin`). Redirige a `/admin/login` si no hay sesión o si el backend
 * la rechaza; muestra "acceso denegado" si el usuario autenticado no es admin.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { loading, configured, token, byAccessKey, signOut } = useAdminSession();
  // Con llave de acceso no hace falta el cliente Supabase del navegador.
  const usable = configured || byAccessKey;

  // Sólo consultamos /me cuando ya hay token (evita un 401 esperado).
  const me = useApi<{ adminId: string; email: string | null }>(token ? "/api/admin/me" : null);

  useEffect(() => {
    if (!loading && usable && !token) router.replace("/admin/login");
  }, [loading, usable, token, router]);

  useEffect(() => {
    if (token && me.status === 401) router.replace("/admin/login");
  }, [token, me.status, router]);

  if (!usable) {
    return (
      <FullScreen>
        <h1 className="font-display text-xl font-bold">Panel no disponible</h1>
        <p className="mt-2 text-sm text-muted">
          Falta configurar Supabase (<code>SUPABASE_SERVICE_ROLE_KEY</code> y las variables{" "}
          <code>NEXT_PUBLIC_SUPABASE_*</code>) en este entorno.
        </p>
      </FullScreen>
    );
  }

  if (loading || (token && me.loading)) {
    return (
      <FullScreen>
        <Skeleton className="mx-auto h-8 w-40" />
        <Skeleton className="mx-auto mt-3 h-4 w-64" />
      </FullScreen>
    );
  }

  if (!token) return null; // redirigiendo a login

  if (me.status === 503) {
    return (
      <FullScreen>
        <h1 className="font-display text-xl font-bold">Panel no disponible</h1>
        <p className="mt-2 text-sm text-muted">
          El servidor no tiene la clave de servicio configurada. Ver <code>docs/ADMIN.md</code>.
        </p>
        <div className="mt-4">
          <Button variant="ghost" onClick={() => void signOut()}>
            Salir
          </Button>
        </div>
      </FullScreen>
    );
  }

  if (me.status === 403) {
    return (
      <FullScreen>
        <h1 className="font-display text-xl font-bold">Acceso denegado</h1>
        <p className="mt-2 text-sm text-muted">
          Tu cuenta está autenticada pero no tiene permisos de administrador.
        </p>
        <div className="mt-4">
          <Button variant="ghost" onClick={() => void signOut()}>
            Cerrar sesión
          </Button>
        </div>
      </FullScreen>
    );
  }

  if (me.error && !me.data) {
    return (
      <FullScreen>
        <h1 className="font-display text-xl font-bold">No se pudo verificar el acceso</h1>
        <p className="mt-2 text-sm text-muted">{me.error}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="ghost" onClick={me.reload}>
            Reintentar
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            Salir
          </Button>
        </div>
      </FullScreen>
    );
  }

  if (!me.data) return null;

  return <>{children}</>;
}
