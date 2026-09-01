"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAdminSession } from "@/components/admin/AdminSession";
import { Button } from "@/components/admin/ui";

export default function AdminLoginPage() {
  const router = useRouter();
  const { token, configured, signIn } = useAdminSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) router.replace("/admin");
  }, [token, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      router.replace("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4 text-text">
      <div className="w-full max-w-sm border-2 border-border-strong bg-surface p-6">
        <h1 className="font-display text-xl font-bold tracking-tightest">
          FIVI <span className="text-muted">· Admin</span>
        </h1>
        <p className="mt-1 text-sm text-muted">Acceso restringido a administradores.</p>

        {!configured ? (
          <p className="mt-4 border border-danger bg-surface p-3 text-sm text-danger" role="alert">
            El panel no está configurado en este entorno.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            <label className="block">
              <span className="label-caps">Email</span>
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full border border-border-strong bg-bg px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="label-caps">Contraseña</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full border border-border-strong bg-bg px-3 py-2 text-sm"
              />
            </label>

            {error ? (
              <p className="border border-danger bg-surface p-2 text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Ingresando…" : "Ingresar"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
