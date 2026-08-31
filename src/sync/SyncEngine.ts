/**
 * Motor de sincronización (secciones 16, 17, 20, 21, 32).
 *
 * Responsabilidades:
 *  - Procesar la cola local (`sync_queue`) enviando las operaciones pendientes
 *    al `RemotePort` cuando hay conexión (push).
 *  - Traer cambios remotos (pull) y aplicarlos en la base local con
 *    `applyRemoteChanges` (LWW por `updated_at`).
 *  - Mantener una suscripción Realtime a los grupos abiertos: cada evento
 *    aplica el cambio recibido y dispara un pull de reconciliación.
 *  - Exponer un estado agregado para que la UI lo muestre de forma discreta.
 *
 * No depende de React. La capa de UI se suscribe con `subscribe()`.
 */

import { FiviDatabase, db as defaultDb } from "@/data/db";
import {
  generateInviteToken,
  hashInviteTokenBytea,
} from "@/lib/invites";
import type { GroupRole, RemotePort, RemoteSubscription } from "./RemotePort";
import type { InviteInfo, SyncState } from "./types";
import { applyRemoteChanges } from "./applyRemoteChanges";
import { ACCESS_DENIED_MESSAGE } from "./accessError";
import {
  backoffDelayMs,
  getPendingItems,
  getQueueStats,
  markStatus,
  purgeSynced,
  requeueStaleSyncing,
} from "./queue";

export interface SyncEngineOptions {
  remote: RemotePort;
  database?: FiviDatabase;
  /** Intervalo del polling suave mientras la app está abierta (ms). 0 lo desactiva. */
  pollIntervalMs?: number;
  /**
   * `true` si el remoto real (Supabase) va a entrar por `setRemote` más tarde.
   * Hasta que eso pase, los grupos pedidos por enlace siguen "hydrating" (la UI
   * no dice "no existe" mientras carga el remoto).
   */
  cloudMode?: boolean;
}

type Listener = (state: SyncState) => void;

/** Node expone `navigator` sin `onLine`; sólo confiamos en él en el browser. */
function detectOnline(): boolean {
  if (typeof navigator !== "undefined" && "onLine" in navigator) {
    return navigator.onLine;
  }
  return true;
}

export class SyncEngine {
  private remote: RemotePort;
  private readonly db: FiviDatabase;
  private readonly pollIntervalMs: number;

  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private reconcileTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private inFlight = false;
  private rerunRequested = false;
  private boundTriggers: Array<[string, EventTarget, EventListener]> = [];

  /**
   * Backoff a nivel corrida: si el `syncNow` completo falla (p. ej. la red se
   * cayó), no se vuelve a intentar antes de `nextRunAllowedAt`. Evita tormentas
   * de reintentos disparadas por polling / mutaciones / realtime durante una
   * caída. Los disparos del usuario (abrir un enlace, volver la conexión) pasan
   * igual con `force`.
   */
  private consecutiveFailures = 0;
  private nextRunAllowedAt = 0;

  private subscription: RemoteSubscription | null = null;
  private subscribedKey = "";

  /**
   * Grupos que la UI pidió explícitamente (p. ej. se abrió `/g/<id>` por enlace
   * y todavía no están en la base local). Se incluyen en cada pull.
   */
  private trackedGroupIds = new Set<string>();
  /**
   * Fuerza que el próximo pull sea completo (`cursor = null`): al arrancar el
   * remoto real, al volver la conexión, y al abrir un grupo nuevo por enlace
   * (sus filas tienen `sync_revision` < cursor y un pull incremental no las
   * traería). Tras un pull completo el cursor vuelve a avanzar al máximo visto.
   */
  private forceFullPull = false;
  /**
   * Cursor de sincronización server-owned (máximo `sync_revision` aplicado).
   * `null` = todavía no se hizo ningún pull -> el próximo es completo.
   * Vive sólo en memoria: cada sesión arranca con un pull completo (seguro) y
   * usa el cursor para los pulls incrementales dentro de la sesión.
   */
  private cursor: number | null = null;
  /** Grupos pedidos por enlace todavía sin su primer pull real. */
  private hydratingGroups = new Set<string>();
  /** `true` cuando el remoto que se va a usar ya está listo (o no hay swap pendiente). */
  private remoteReady: boolean;

  private state: SyncState = {
    online: detectOnline(),
    syncing: false,
    pending_count: 0,
    exhausted_count: 0,
    last_synced_at: null,
    last_error: null,
    access_error: null,
    remote_ready: true,
    hydrating_group_ids: [],
  };

  constructor(opts: SyncEngineOptions) {
    this.remote = opts.remote;
    this.db = opts.database ?? defaultDb;
    this.pollIntervalMs = opts.pollIntervalMs ?? 30_000;
    this.remoteReady = !opts.cloudMode;
    this.state.remote_ready = this.remoteReady;
  }

  getState(): SyncState {
    return { ...this.state };
  }

  /**
   * Cambia el repositorio remoto en caliente (p. ej. el stub inicial pasa a ser
   * Supabase cuando termina de cargar). Rehace la suscripción y fuerza un pull
   * completo.
   */
  setRemote(remote: RemotePort): Promise<SyncState> {
    this.remote = remote;
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.subscribedKey = "";
    return this.markRemoteReady();
  }

  /**
   * Marca el remoto como listo (lo llama `setRemote`, o el `SyncProvider` si la
   * carga diferida de Supabase falla, para no dejar grupos "cargando" para
   * siempre). Fuerza un pull completo.
   */
  markRemoteReady(): Promise<SyncState> {
    this.remoteReady = true;
    this.forceFullPull = true;
    this.emit({ remote_ready: true });
    return this.syncNow(true);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private emit(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.getState());
  }

  /** Arranca los triggers (sección 17) y hace un primer intento. */
  start(): void {
    if (this.running) return;
    this.running = true;

    if (typeof window !== "undefined") {
      const onOnline = () => {
        this.emit({ online: true });
        void this.syncNow(true); // volvió la conexión: reintentar ya
      };
      const onOffline = () => this.emit({ online: false });
      const onVisible = () => {
        if (document.visibilityState === "visible") void this.syncNow(true);
      };
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
      document.addEventListener("visibilitychange", onVisible);
      this.boundTriggers = [
        ["online", window, onOnline as EventListener],
        ["offline", window, onOffline as EventListener],
        ["visibilitychange", document, onVisible as EventListener],
      ];
    }

    if (this.pollIntervalMs > 0) {
      this.timer = setInterval(() => {
        if (this.state.online) void this.syncNow();
      }, this.pollIntervalMs);
    }

    void this.syncNow(true);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
    this.timer = null;
    this.reconcileTimer = null;
    for (const [name, target, fn] of this.boundTriggers) {
      target.removeEventListener(name, fn);
    }
    this.boundTriggers = [];
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.subscribedKey = "";
  }

  /**
   * Pide que un grupo entre en la sincronización aunque todavía no exista
   * localmente (acceso por enlace, sección 31). Dispara un pull.
   */
  trackGroup(groupId: string): void {
    if (this.trackedGroupIds.has(groupId)) return;
    this.trackedGroupIds.add(groupId);
    this.hydratingGroups.add(groupId);
    this.forceFullPull = true;
    this.emit({ hydrating_group_ids: [...this.hydratingGroups] });
    void this.syncNow(true);
  }

  // --- Invitaciones (Etapa 7) ------------------------------------------------
  // El motor orquesta; el `RemotePort` real habla con Supabase. En modo local
  // estos métodos lanzan un error claro (no hay usuarios ni invitaciones).

  private static readonly INVITES_UNSUPPORTED =
    "Las invitaciones requieren Supabase configurado";

  /**
   * Canjea un token de invitación. El servidor valida y agrega al usuario a
   * `group_members`; acá se empieza a seguir el grupo (pull completo) y se
   * devuelve su id para que la UI navegue.
   */
  async redeemInvite(token: string): Promise<string> {
    if (!this.remote.redeemInvite) {
      throw new Error(SyncEngine.INVITES_UNSUPPORTED);
    }
    const { group_id } = await this.remote.redeemInvite({ token });
    this.trackGroup(group_id);
    return group_id;
  }

  /**
   * Crea una invitación para `groupId`. Genera el token localmente, manda sólo
   * su hash al servidor y devuelve el token crudo (se muestra una única vez).
   */
  async createInvite(
    groupId: string,
    opts: { expiresInDays?: number; maxUses?: number } = {},
  ): Promise<{ token: string; id: string }> {
    if (!this.remote.createInvite) {
      throw new Error(SyncEngine.INVITES_UNSUPPORTED);
    }
    const token = generateInviteToken();
    const token_hash = await hashInviteTokenBytea(token);
    const expires_at =
      opts.expiresInDays && opts.expiresInDays > 0
        ? new Date(Date.now() + opts.expiresInDays * 86_400_000).toISOString()
        : null;
    const { id } = await this.remote.createInvite!({
      group_id: groupId,
      token_hash,
      expires_at,
      max_uses: opts.maxUses ?? null,
    });
    return { token, id };
  }

  listInvites(groupId: string): Promise<InviteInfo[]> {
    return this.remote.listInvites ? this.remote.listInvites(groupId) : Promise.resolve([]);
  }

  async revokeInvite(inviteId: string): Promise<void> {
    await this.remote.revokeInvite?.(inviteId);
  }

  getGroupRole(groupId: string): Promise<GroupRole | null> {
    return this.remote.getGroupRole
      ? this.remote.getGroupRole(groupId)
      : Promise.resolve(null);
  }

  /** Debounce de un pull de reconciliación tras un evento Realtime. */
  private scheduleReconcile(): void {
    if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
    this.reconcileTimer = setTimeout(() => void this.syncNow(), 800);
  }

  /** (Re)suscribe Realtime si cambió el conjunto de grupos abiertos. */
  private refreshSubscription(groupIds: string[]): void {
    if (!this.remote.subscribe || !this.running) return;
    const key = [...groupIds].sort().join(",");
    if (key === this.subscribedKey) return;

    this.subscription?.unsubscribe();
    this.subscribedKey = key;
    this.subscription =
      groupIds.length > 0
        ? this.remote.subscribe({
            group_ids: groupIds,
            onChange: (changes) => {
              void applyRemoteChanges(changes, this.db)
                .then(() => this.scheduleReconcile())
                .catch(() => this.scheduleReconcile());
            },
          })
        : null;
  }

  private async emitQueueCounts(patch: Partial<SyncState> = {}) {
    const stats = await getQueueStats(this.db);
    this.emit({
      pending_count: stats.pending,
      exhausted_count: stats.exhausted,
      ...patch,
    });
  }

  /**
   * Procesa la cola una vez: push de pendientes + pull de cambios remotos +
   * aplicación local. Es reentrante-seguro.
   *
   * @param force salta el backoff a nivel corrida (disparos del usuario:
   *              abrir un enlace, volver la conexión, arranque).
   */
  async syncNow(force = false): Promise<SyncState> {
    // Si ya hay una corrida en curso, pedir otra al terminar (así un
    // `trackGroup` / `setRemote` disparado durante un sync igual se procesa).
    if (this.inFlight) {
      this.rerunRequested = true;
      return this.getState();
    }
    if (!detectOnline()) {
      await this.emitQueueCounts({ online: false });
      return this.getState();
    }
    // Backoff a nivel corrida: tras una falla completa, no reintentar antes de
    // tiempo salvo que el usuario lo pida (`force`).
    if (!force && Date.now() < this.nextRunAllowedAt) {
      return this.getState();
    }

    this.inFlight = true;
    // Sólo para mostrar "última sincronización OK" en la UI. NO es un cursor:
    // el cursor de pull es `this.cursor` (server-owned, ver fase 3).
    const startedAt = new Date().toISOString();
    // ¿Hubo en esta corrida un rechazo por falta de acceso (RLS / sesión)?
    let accessDenied = false;

    try {
      await requeueStaleSyncing(this.db);

      const pending = await getPendingItems(
        this.db,
        force ? { ignoreBackoff: true } : {},
      );
      if (pending.length > 0) {
        this.emit({ syncing: true, last_error: null });
        await markStatus(
          pending.map((p) => p.id),
          "syncing",
          this.db,
        );
        let result;
        try {
          result = await this.remote.push(pending);
        } catch (pushErr) {
          // Toda la tanda falló (red caída, transporte): NO es culpa del item,
          // así que se vuelven a `pending` (sin gastar `attempts`) y el backoff
          // a nivel corrida (`nextRunAllowedAt`) pacea el reintento. Evita que
          // una caída larga "agote" datos válidos.
          await markStatus(pending.map((p) => p.id), "pending", this.db);
          throw pushErr;
        }
        await markStatus(result.accepted_ids, "synced", this.db);
        // Rechazo por item (el servidor rechazó esa fila puntual, p. ej. una
        // constraint o una policy de RLS): sí cuenta `attempts` y agota tras
        // `MAX_ATTEMPTS`. El cambio local NO se borra (sólo `purgeSynced` limpia,
        // y sólo lo `synced`).
        for (const r of result.rejected) {
          if (r.error === ACCESS_DENIED_MESSAGE) accessDenied = true;
          await markStatus([r.id], "error", this.db, { error: r.error });
        }
      }

      const localGroupIds = (await this.db.groups.toArray())
        .filter((g) => g.deleted_at === null)
        .map((g) => g.id);
      const groupIds = [
        ...new Set([...localGroupIds, ...this.trackedGroupIds]),
      ];

      const pullCursor = this.forceFullPull ? null : this.cursor;
      const changes = await this.remote.pull({
        group_ids: groupIds,
        cursor: pullCursor,
      });
      await applyRemoteChanges(changes, this.db);
      this.forceFullPull = false;

      // Avanzar el cursor al máximo `sync_revision` recibido (monotónico).
      for (const c of changes) {
        if (
          typeof c.sync_revision === "number" &&
          (this.cursor === null || c.sync_revision > this.cursor)
        ) {
          this.cursor = c.sync_revision;
        }
      }

      await purgeSynced(this.db);
      this.refreshSubscription(groupIds);

      // Un pull real terminó: los grupos pedidos por enlace ya no están "cargando".
      if (this.remoteReady && this.hydratingGroups.size > 0) {
        this.hydratingGroups.clear();
      }

      this.consecutiveFailures = 0;
      this.nextRunAllowedAt = 0;

      await this.emitQueueCounts({
        syncing: false,
        online: true,
        last_synced_at: startedAt,
        access_error: accessDenied ? ACCESS_DENIED_MESSAGE : null,
        hydrating_group_ids: [...this.hydratingGroups],
      });
    } catch (err) {
      this.consecutiveFailures++;
      this.nextRunAllowedAt =
        Date.now() + backoffDelayMs(this.consecutiveFailures);
      await this.emitQueueCounts({
        syncing: false,
        last_error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.inFlight = false;
    }

    if (this.rerunRequested) {
      this.rerunRequested = false;
      // El re-run sólo procesa lo que cambió durante la corrida; no re-fuerza
      // (el pedido forzado original ya se atendió). Evita encadenar bypasses
      // del backoff si algo falla repetidamente.
      return this.syncNow(false);
    }

    return this.getState();
  }
}
