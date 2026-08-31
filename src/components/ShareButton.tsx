"use client";

import { useState } from "react";
import { Button } from "./Button";
import { useSyncActions, useSyncState } from "./SyncProvider";

/**
 * Comparte el acceso al grupo (sección 31).
 *
 * - Con Supabase (cloud): genera una **invitación con token** y comparte
 *   `/join/<token>`. El UUID del grupo por sí solo no da acceso (Etapa 7).
 * - Sin Supabase (local): comparte `/g/<id>`, que sólo sirve en este mismo
 *   dispositivo (los datos no salen de acá).
 *
 * Usa `navigator.share` en móvil y cae en copiar al portapapeles.
 */
export function ShareButton({
  groupId,
  groupName,
}: {
  groupId: string;
  groupName: string;
}) {
  const { backend } = useSyncState();
  const { createInvite } = useSyncActions();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";

  async function deliver(url: string) {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: groupName,
          text: `Sumate al grupo "${groupName}" en fivi`,
          url,
        });
        return;
      } catch {
        // usuario canceló o no soportado: seguimos con el portapapeles
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copiá el enlace para compartir el grupo:", url);
    }
  }

  async function share() {
    setError(null);
    if (backend === "local") {
      await deliver(`${origin}/g/${groupId}`);
      return;
    }
    setBusy(true);
    try {
      const { token } = await createInvite(groupId);
      await deliver(`${origin}/join/${token}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button variant="secondary" full onClick={share} disabled={busy}>
        {busy
          ? "Generando enlace…"
          : copied
            ? "Enlace copiado ✓"
            : backend === "local"
              ? "Compartir grupo"
              : "Crear enlace de invitación"}
      </Button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {backend === "local" ? (
        <p className="text-xs opacity-55">
          Sin servidor configurado: el enlace sólo abre el grupo en este
          dispositivo.
        </p>
      ) : null}
    </div>
  );
}
