"use client";

/**
 * Gestión de invitaciones del grupo (Etapa 7). Sólo tiene sentido con Supabase
 * configurado; en modo local no se renderiza.
 *
 * El enlace completo (`/join/<token>`) se muestra **una sola vez**, al crearlo:
 * el servidor sólo guarda el hash del token, así que no se puede volver a armar
 * después. La lista muestra el estado de cada invitación y permite revocarla.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { useLocale } from "./LocaleProvider";
import { useSyncActions, useSyncState } from "./SyncProvider";
import type { GroupRole } from "@/sync/RemotePort";
import type { InviteInfo } from "@/sync/types";
import { formatDate } from "@/lib/format";

type InviteState = "active" | "revoked" | "expired" | "noUses";

function inviteState(i: InviteInfo): InviteState {
  if (i.revoked_at) return "revoked";
  if (i.expires_at && new Date(i.expires_at) < new Date()) return "expired";
  if (i.max_uses != null && i.uses >= i.max_uses) return "noUses";
  return "active";
}

export function InvitesSection({ groupId }: { groupId: string }) {
  const { t } = useTranslation(["settings", "errors"]);
  const { lang } = useLocale();
  const { backend, online } = useSyncState();
  const { createInvite, listInvites, revokeInvite, getGroupRole, userId } =
    useSyncActions();

  const [role, setRole] = useState<GroupRole | null>(null);
  const [invites, setInvites] = useState<InviteInfo[] | null>(null);
  const [freshLink, setFreshLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void listInvites(groupId).then(setInvites).catch(() => setInvites([]));
    void getGroupRole(groupId).then(setRole).catch(() => setRole(null));
  }, [groupId, listInvites, getGroupRole]);

  useEffect(() => {
    if (backend === "cloud") refresh();
  }, [backend, refresh]);

  if (backend !== "cloud") return null;

  async function create() {
    setError(null);
    setBusy(true);
    try {
      const { token } = await createInvite(groupId);
      setFreshLink(`${window.location.origin}/join/${token}`);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors:generic"));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setError(null);
    try {
      await revokeInvite(id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors:generic"));
    }
  }

  const active = (invites ?? []).filter((i) => inviteState(i) === "active");

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="label-caps">
          {t("settings:invitesTitle")}
        </h2>
        {role ? (
          <span className="text-xs text-muted">
            {role === "owner"
              ? t("settings:invitesRoleOwner")
              : t("settings:invitesRoleMember")}
          </span>
        ) : null}
      </div>

      <p className="text-xs text-muted">{t("settings:invitesIntro")}</p>

      <Button variant="secondary" onClick={create} disabled={busy || !online}>
        {busy
          ? t("settings:invitesCreating")
          : t("settings:invitesCreate")}
      </Button>

      {freshLink ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-accent/40 bg-accent-weak p-3">
          <p className="text-xs text-muted">{t("settings:invitesCopyNow")}</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={freshLink}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-sm bg-surface px-2 py-1 text-xs text-text"
              aria-label={t("settings:invitesTitle")}
            />
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(freshLink)}
              className="min-h-touch shrink-0 rounded-sm px-2 text-xs font-medium text-accent hover:bg-surface"
            >
              {t("settings:invitesCopy")}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      {invites === null ? (
        <p className="text-sm text-muted">{t("settings:invitesLoading")}</p>
      ) : active.length === 0 ? (
        <p className="text-sm text-muted">{t("settings:invitesNone")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {active.map((i) => (
            <li
              key={i.id}
              className="flex items-center justify-between gap-2 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate text-text">
                  {t("settings:invitesCreatedOn", {
                    date: formatDate(i.created_at.slice(0, 10), lang),
                  })}
                </span>
                <span className="block text-xs text-muted">
                  {i.max_uses != null
                    ? t("settings:invitesUsesOf", {
                        count: i.uses,
                        max: i.max_uses,
                      })
                    : t("settings:invitesUses", { count: i.uses })}
                  {i.expires_at
                    ? ` · ${t("settings:invitesExpiresOn", {
                        date: formatDate(i.expires_at.slice(0, 10), lang),
                      })}`
                    : ""}
                  {i.created_by === userId
                    ? ` · ${t("settings:invitesYours")}`
                    : ""}
                </span>
              </span>
              {role === "owner" || i.created_by === userId ? (
                <button
                  type="button"
                  onClick={() => void revoke(i.id)}
                  className="min-h-touch shrink-0 rounded-sm px-2 text-xs font-medium text-danger hover:bg-danger/10"
                >
                  {t("settings:invitesRevoke")}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
