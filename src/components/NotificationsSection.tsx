"use client";

/**
 * Aviso push cuando el saldo propio en este grupo pasa a negativo (le
 * corresponde pagar). Sólo tiene sentido con Supabase configurado y con
 * "quién sos en este grupo" ya elegido — sin eso no hay a quién avisarle.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SegmentedControl } from "@/components/ui/primitives";
import { useSyncActions, useSyncState } from "./SyncProvider";
import { useMe, setNotify, useNotify } from "@/data/settings";
import { isPushSupported, needsIosInstall, subscribeToPush } from "@/lib/push";

/** `status` viaja al mensaje de error: un 401 y un 500 se arreglan distinto. */
async function callSubscribeApi(
  token: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number | string }> {
  try {
    const res = await fetch("/api/notifications/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    // Ni siquiera salió el pedido (sin conexión, DNS, etc.).
    return { ok: false, status: "sin respuesta" };
  }
}

export function NotificationsSection({ groupId }: { groupId: string }) {
  const { t } = useTranslation(["settings"]);
  const { backend } = useSyncState();
  const { getAccessToken } = useSyncActions();
  const me = useMe(groupId);
  const notifyOn = useNotify(groupId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (backend !== "cloud" || !me) return null;
  if (!isPushSupported()) return null;

  if (needsIosInstall()) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="label-caps">{t("settings:sectionNotifications")}</h2>
        <p className="text-xs text-muted">{t("settings:notificationsIosHint")}</p>
      </section>
    );
  }

  async function toggle(next: "on" | "off") {
    setError(null);
    const token = await getAccessToken();
    if (!token) {
      setError(t("settings:notificationsErrorSession"));
      return;
    }

    if (next === "off") {
      setBusy(true);
      const res = await callSubscribeApi(token, {
        groupId,
        participantId: me,
        enabled: false,
      });
      setBusy(false);
      if (!res.ok) {
        setError(t("settings:notificationsErrorServer", { status: res.status }));
        return;
      }
      await setNotify(groupId, false);
      return;
    }

    setBusy(true);
    try {
      const sub = await subscribeToPush();
      if (!sub.ok) {
        setError(
          sub.reason === "unsupported"
            ? t("settings:notificationsErrorUnsupported")
            : sub.reason === "no-vapid-key"
              ? t("settings:notificationsErrorNoKey")
              : sub.reason === "permission-denied"
                ? t("settings:notificationsErrorPermission")
                : t("settings:notificationsErrorBrowser", {
                    detail: sub.detail ?? "?",
                  }),
        );
        return;
      }
      const res = await callSubscribeApi(token, {
        groupId,
        participantId: me,
        subscription: sub.subscription,
        enabled: true,
      });
      if (!res.ok) {
        setError(t("settings:notificationsErrorServer", { status: res.status }));
        return;
      }
      await setNotify(groupId, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="label-caps">{t("settings:sectionNotifications")}</h2>
      <SegmentedControl
        label={t("settings:notificationsLabel")}
        options={[
          { value: "off", label: t("settings:notificationsOff") },
          { value: "on", label: t("settings:notificationsOn") },
        ]}
        value={notifyOn ? "on" : "off"}
        onChange={(v) => void toggle(v as "on" | "off")}
      />
      <p className="text-xs text-muted">{t("settings:notificationsHint")}</p>
      {busy ? (
        <p className="text-xs text-muted">{t("settings:notificationsWorking")}</p>
      ) : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </section>
  );
}
