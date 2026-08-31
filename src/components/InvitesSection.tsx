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
import { Button } from "./Button";
import { useSyncActions, useSyncState } from "./SyncProvider";
import type { GroupRole } from "@/sync/RemotePort";
import type { InviteInfo } from "@/sync/types";
import { formatDate } from "@/lib/format";

function inviteStatus(i: InviteInfo): string {
  if (i.revoked_at) return "revocada";
  if (i.expires_at && new Date(i.expires_at) < new Date()) return "vencida";
  if (i.max_uses != null && i.uses >= i.max_uses) return "sin usos";
  return "activa";
}

export function InvitesSection({ groupId }: { groupId: string }) {
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
      setError(err instanceof Error ? err.message : String(err));
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
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const active = (invites ?? []).filter((i) => inviteStatus(i) === "activa");

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium opacity-60">Invitaciones</h2>
        {role ? (
          <span className="text-xs opacity-50">
            {role === "owner" ? "Sos owner" : "Sos miembro"}
          </span>
        ) : null}
      </div>

      <p className="text-xs opacity-55">
        Compartí el grupo con un enlace de un solo token. Conocer el ID del grupo
        no alcanza para entrar.
      </p>

      <Button variant="secondary" onClick={create} disabled={busy || !online}>
        {busy ? "Generando…" : "Crear enlace de invitación"}
      </Button>

      {freshLink ? (
        <div className="flex flex-col gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="text-xs opacity-70">
            Copiá el enlace ahora: por seguridad se muestra una sola vez.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={freshLink}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg bg-black/5 px-2 py-1 text-xs dark:bg-white/10"
            />
            <button
              onClick={() => void navigator.clipboard?.writeText(freshLink)}
              className="shrink-0 rounded-lg px-2 py-1 text-xs opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
            >
              Copiar
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      {invites === null ? (
        <p className="text-sm opacity-50">Cargando invitaciones…</p>
      ) : active.length === 0 ? (
        <p className="text-sm opacity-50">No hay invitaciones activas.</p>
      ) : (
        <ul className="divide-y divide-black/5 dark:divide-white/10">
          {active.map((i) => (
            <li
              key={i.id}
              className="flex items-center justify-between gap-2 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate">
                  Creada {formatDate(i.created_at.slice(0, 10))}
                </span>
                <span className="block text-xs opacity-55">
                  {i.uses} uso{i.uses === 1 ? "" : "s"}
                  {i.max_uses != null ? ` / ${i.max_uses}` : ""}
                  {i.expires_at
                    ? ` · vence ${formatDate(i.expires_at.slice(0, 10))}`
                    : ""}
                  {i.created_by === userId ? " · la creaste vos" : ""}
                </span>
              </span>
              {role === "owner" || i.created_by === userId ? (
                <button
                  onClick={() => void revoke(i.id)}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-500/10"
                >
                  Revocar
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
