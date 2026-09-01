"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAdminSession } from "@/components/admin/AdminSession";
import { Button } from "@/components/admin/ui";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}

/**
 * Acceso al panel con la **llave compartida** (etapa previa a la autenticación
 * de administradores). Se puede llegar con la llave en la URL (`?k=…`), que se
 * guarda en este navegador y se limpia de la barra de direcciones, o pegarla a
 * mano. La verificación real la hace el backend en cada endpoint.
 */
function AdminLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { token, signInWithKey } = useAdminSession();
  const [key, setKey] = useState("");

  // Llave en la URL: se guarda y se saca de la barra (no queda en el historial).
  useEffect(() => {
    const fromUrl = params.get("k");
    if (fromUrl && fromUrl.trim() !== "") {
      signInWithKey(fromUrl);
      router.replace("/admin");
    }
  }, [params, signInWithKey, router]);

  useEffect(() => {
    if (token) router.replace("/admin");
  }, [token, router]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (key.trim() === "") return;
    signInWithKey(key);
    router.replace("/admin");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4 text-text">
      <div className="w-full max-w-sm border-2 border-border-strong bg-surface p-6">
        <h1 className="font-display text-xl font-bold tracking-tightest">
          FIVI <span className="text-muted">· Admin</span>
        </h1>
        <p className="mt-1 text-sm text-muted">Acceso restringido.</p>

        <form onSubmit={onSubmit} noValidate className="mt-5 space-y-4">
          <label className="block">
            <span className="label-caps">Llave de acceso</span>
            <input
              type="password"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="mt-1 w-full border border-border-strong bg-bg px-3 py-2 text-base"
            />
          </label>

          <Button type="submit" disabled={key.trim() === ""} className="w-full">
            Entrar
          </Button>
        </form>

        <p className="mt-4 text-xs text-muted">
          Provisorio: la llave se guarda en este navegador. En la próxima etapa se
          reemplaza por cuentas de administrador con email y contraseña.
        </p>
      </div>
    </div>
  );
}
