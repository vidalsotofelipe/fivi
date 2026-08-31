"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation(["settings", "errors"]);
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
          text: t("settings:shareInviteText", { name: groupName }),
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
      window.prompt(t("settings:shareCopyPrompt"), url);
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
      setError(err instanceof Error ? err.message : t("errors:generic"));
    } finally {
      setBusy(false);
    }
  }

  const label = busy
    ? t("settings:shareGenerating")
    : copied
      ? `${t("settings:shareCopied")} ✓`
      : backend === "local"
        ? t("settings:shareGroup")
        : t("settings:invitesCreate");

  return (
    <div className="flex flex-col gap-1.5">
      <Button variant="secondary" full onClick={share} disabled={busy}>
        {label}
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {backend === "local" ? (
        <p className="text-xs text-muted">{t("settings:shareLocalHint")}</p>
      ) : null}
    </div>
  );
}
