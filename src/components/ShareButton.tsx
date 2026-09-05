"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { QrCode } from "./QrCode";
import { BottomSheet } from "./ui/overlays";
import { useSyncActions, useSyncState } from "./SyncProvider";

/**
 * Comparte el acceso al grupo (sección 31), de dos formas:
 *
 * - **Enlace**: `navigator.share` en móvil, con fallback a portapapeles.
 * - **QR**: para cuando la otra persona está al lado — abre y escanea, sin
 *   pasar por WhatsApp ni pegar nada.
 *
 * Según el modo:
 * - Con Supabase (cloud): genera una **invitación con token** y comparte
 *   `/join/<token>`. El UUID del grupo por sí solo no da acceso (Etapa 7).
 * - Sin Supabase (local): comparte `/g/<id>`, que sólo sirve en este mismo
 *   dispositivo (los datos no salen de acá).
 *
 * Cada acción genera su propia invitación (una por enlace repartido), igual
 * que antes: son de un solo token, no se reusa la anterior.
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
  const [qrBusy, setQrBusy] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
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

  /** El enlace a repartir: con token en cloud, el id del grupo en local. */
  async function buildUrl(): Promise<string> {
    if (backend === "local") return `${origin}/g/${groupId}`;
    const { token } = await createInvite(groupId);
    return `${origin}/join/${token}`;
  }

  async function share() {
    setError(null);
    setBusy(true);
    try {
      await deliver(await buildUrl());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors:generic"));
    } finally {
      setBusy(false);
    }
  }

  async function showQr() {
    setError(null);
    setQrBusy(true);
    try {
      setQrUrl(await buildUrl());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors:generic"));
    } finally {
      setQrBusy(false);
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
      <Button variant="secondary" full onClick={share} disabled={busy || qrBusy}>
        {label}
      </Button>
      <Button
        variant="secondary"
        full
        onClick={showQr}
        disabled={busy || qrBusy}
      >
        {qrBusy ? t("settings:shareGenerating") : t("settings:shareQr")}
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {backend === "local" ? (
        <p className="text-xs text-muted">{t("settings:shareLocalHint")}</p>
      ) : null}

      <BottomSheet
        open={qrUrl !== null}
        onClose={() => setQrUrl(null)}
        title={t("settings:shareQrTitle", { name: groupName })}
      >
        {qrUrl ? (
          <div className="flex flex-col items-center gap-3 pb-2">
            <div className="rounded-md bg-white p-3">
              <QrCode value={qrUrl} label={t("settings:shareQrAlt")} />
            </div>
            <p className="text-center text-xs text-muted">
              {t("settings:shareQrHint")}
            </p>
            {/*
              El enlace también en texto: un QR no sirve si la otra persona no
              tiene cámara a mano, o si quien comparte quiere pegarlo en un chat.
            */}
            <input
              readOnly
              value={qrUrl}
              onFocus={(e) => e.currentTarget.select()}
              aria-label={t("settings:shareQrTitle", { name: groupName })}
              className="w-full rounded-sm border border-border bg-surface px-2 py-1 text-center text-xs text-muted"
            />
            <Button variant="secondary" full onClick={() => void deliver(qrUrl)}>
              {copied ? `${t("settings:shareCopied")} ✓` : t("settings:invitesCopy")}
            </Button>
          </div>
        ) : null}
      </BottomSheet>
    </div>
  );
}
