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
import type { RemotePort, RemoteSubscription } from "./RemotePort";
import type { SyncState } from "./types";
import { applyRemoteChanges } from "./applyRemoteChanges";
import {
  countPending,
  getPendingItems,
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

  private subscription: RemoteSubscription | null = null;
  private subscribedKey = "";

  /**
   * Grupos que la UI pidió explícitamente (p. ej. se abrió `/g/<id>` por enlace
   * y todavía no están en la base local). Se incluyen en cada pull.
   */
  private trackedGroupIds = new Set<string>();
  /** Fuerza que el próximo pull sea completo (since=null), p. ej. al abrir un grupo nuevo por enlace. */
  private forceFullPull = false;
  /** Grupos pedidos por enlace todavía sin su primer pull real. */
  private hydratingGroups = new Set<string>();
  /** `true` cuando el remoto que se va a usar ya está listo (o no hay swap pendiente). */
  private remoteReady: boolean;

  private state: SyncState = {
    online: detectOnline(),
    syncing: false,
    pending_count: 0,
    last_synced_at: null,
    last_error: null,
    hydrating_group_ids: [],
  };

  constructor(opts: SyncEngineOptions) {
    this.remote = opts.remote;
    this.db = opts.database ?? defaultDb;
    this.pollIntervalMs = opts.pollIntervalMs ?? 30_000;
    this.remoteReady = !opts.cloudMode;
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
    return this.syncNow();
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
        void this.syncNow();
      };
      const onOffline = () => this.emit({ online: false });
      const onVisible = () => {
        if (document.visibilityState === "visible") void this.syncNow();
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

    void this.syncNow();
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
    void this.syncNow();
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

  /**
   * Procesa la cola una vez: push de pendientes + pull de cambios remotos +
   * aplicación local. Es reentrante-seguro.
   */
  async syncNow(): Promise<SyncState> {
    // Si ya hay una corrida en curso, pedir otra al terminar (así un
    // `trackGroup` / `setRemote` disparado durante un sync igual se procesa).
    if (this.inFlight) {
      this.rerunRequested = true;
      return this.getState();
    }
    if (!detectOnline()) {
      this.emit({ online: false, pending_count: await countPending(this.db) });
      return this.getState();
    }

    this.inFlight = true;
    // Marca temporal previa: lo que se escriba durante esta corrida entra en el
    // próximo pull (evita perder filas por la ventana de tiempo).
    const startedAt = new Date().toISOString();

    try {
      await requeueStaleSyncing(this.db);

      const pending = await getPendingItems(this.db);
      if (pending.length > 0) {
        this.emit({ syncing: true, last_error: null });
        await markStatus(
          pending.map((p) => p.id),
          "syncing",
          this.db,
        );
        const result = await this.remote.push(pending);
        await markStatus(result.accepted_ids, "synced", this.db);
        for (const r of result.rejected) {
          await markStatus([r.id], "error", this.db, r.error);
        }
      }

      const localGroupIds = (await this.db.groups.toArray())
        .filter((g) => g.deleted_at === null)
        .map((g) => g.id);
      const groupIds = [
        ...new Set([...localGroupIds, ...this.trackedGroupIds]),
      ];

      const since = this.forceFullPull ? null : this.state.last_synced_at;
      const changes = await this.remote.pull({ group_ids: groupIds, since });
      await applyRemoteChanges(changes, this.db);
      this.forceFullPull = false;

      await purgeSynced(this.db);
      this.refreshSubscription(groupIds);

      // Un pull real terminó: los grupos pedidos por enlace ya no están "cargando".
      if (this.remoteReady && this.hydratingGroups.size > 0) {
        this.hydratingGroups.clear();
      }

      this.emit({
        syncing: false,
        online: true,
        pending_count: await countPending(this.db),
        last_synced_at: startedAt,
        hydrating_group_ids: [...this.hydratingGroups],
      });
    } catch (err) {
      this.emit({
        syncing: false,
        last_error: err instanceof Error ? err.message : String(err),
        pending_count: await countPending(this.db),
      });
    } finally {
      this.inFlight = false;
    }

    if (this.rerunRequested) {
      this.rerunRequested = false;
      return this.syncNow();
    }

    return this.getState();
  }
}
