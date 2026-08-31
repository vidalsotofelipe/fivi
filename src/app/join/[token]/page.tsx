"use client";

/**
 * Canje de invitación (Etapa 7): `/join/<token>`.
 *
 * El UUID de un grupo ya no da acceso. Este enlace lleva un token aleatorio que
 * el servidor valida (RPC `redeem_group_invite`): si es válido y no está
 * revocado ni vencido, agrega al usuario anónimo actual a `group_members` y
 * devuelve el grupo, al que se navega. Todo el trabajo de acceso lo hace el
 * servidor; acá sólo se orquesta y se muestran los estados.
 */
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LinkButton } from "@/components/Button";
import { EmptyState, Loading } from "@/components/EmptyState";
import { useSyncActions, useSyncState } from "@/components/SyncProvider";

type Phase = "working" | "error";

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { redeemInvite } = useSyncActions();
  const { backend, online, remote_ready } = useSyncState();

  const [phase, setPhase] = useState<Phase>("working");
  const [message, setMessage] = useState<string>("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;

    if (backend === "local") {
      started.current = true;
      setPhase("error");
      setMessage(
        "Este enlace necesita la versión con servidor. En modo local los grupos no se comparten entre dispositivos.",
      );
      return;
    }
    if (!online) {
      started.current = true;
      setPhase("error");
      setMessage("Necesitás conexión para aceptar la invitación. Probá de nuevo cuando vuelvas a estar online.");
      return;
    }
    // Esperar a que el remoto real (Supabase + sesión) esté listo.
    if (!remote_ready) return;

    started.current = true;
    redeemInvite(token)
      .then((groupId) => router.replace(`/g/${groupId}`))
      .catch((err) => {
        setPhase("error");
        setMessage(err instanceof Error ? err.message : String(err));
      });
  }, [token, backend, online, remote_ready, redeemInvite, router]);

  if (phase === "working") {
    return (
      <AppShell title="Sumándote al grupo" back="/">
        <Loading />
      </AppShell>
    );
  }

  return (
    <AppShell title="No se pudo abrir la invitación" back="/">
      <EmptyState
        title="No se pudo abrir la invitación"
        description={message}
        action={<LinkButton href="/">Volver al inicio</LinkButton>}
      />
    </AppShell>
  );
}
