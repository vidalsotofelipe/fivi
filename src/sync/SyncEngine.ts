/**
 * Motor de sincronización (secciones 16, 17, 20, 21).
 *
 * Responsabilidades:
 *  - Procesar la cola local (`sync_queue`) enviando las operaciones pendientes
 *    al `RemotePort` cuando hay conexión.
 *  - Traer cambios remotos (pull) y dejarlos listos para aplicar.
 *  - Exponer un estado agregado para que la UI lo muestre de forma discreta.
 *
 * No depende de React. La capa de UI se suscribe con `subscribe()`.
 *
 * En esta etapa la aplicación de cambios remotos y la resolución de conflictos
 * están fuera de alcance: el pull se ejecuta pero su resultado sólo se cuenta.
 * La estrategia de conflictos (LWW por `updated_at` + `version`) está descrita
 * en docs/ARCHITECTURE.md.
 */

import { FiviDatabase, db as defaultDb } from "@/data/db";
import type { RemotePort } from "./RemotePort";
import type { SyncState } from "./types";
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
  private readonly remote: RemotePort;
  private readonly db: FiviDatabase;
  private readonly pollIntervalMs: number;

  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private inFlight = false;
  private boundTriggers: Array<[string, EventTarget, EventListener]> = [];

  private state: SyncState = {
    online: detectOnline(),
    syncing: false,
    pending_count: 0,
    last_synced_at: null,
    last_error: null,
  };

  constructor(opts: SyncEngineOptions) {
    this.remote = opts.remote;
    this.db = opts.database ?? defaultDb;
    this.pollIntervalMs = opts.pollIntervalMs ?? 30_000;
  }

  getState(): SyncState {
    return { ...this.state };
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
    this.timer = null;
    for (const [name, target, fn] of this.boundTriggers) {
      target.removeEventListener(name, fn);
    }
    this.boundTriggers = [];
  }

  /**
   * Procesa la cola una vez: push de pendientes + pull de cambios remotos.
   * Es reentrante-seguro: si ya hay una corrida en curso, no hace nada.
   */
  async syncNow(): Promise<SyncState> {
    if (this.inFlight) return this.getState();
    if (!detectOnline()) {
      this.emit({ online: false, pending_count: await countPending(this.db) });
      return this.getState();
    }

    this.inFlight = true;

    try {
      // Recupera operaciones que quedaron a medias en una corrida anterior.
      await requeueStaleSyncing(this.db);

      const pending = await getPendingItems(this.db);
      // Sólo mostramos "sincronizando" si hay algo real que enviar; así el
      // indicador de la UI no parpadea en cada corrida de fondo.
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

      // Pull: en esta etapa sólo se ejecuta; aplicar cambios queda pendiente.
      const groupIds = (await this.db.groups.toArray())
        .filter((g) => g.deleted_at === null)
        .map((g) => g.id);
      await this.remote.pull({
        group_ids: groupIds,
        since: this.state.last_synced_at,
      });

      await purgeSynced(this.db);

      this.emit({
        syncing: false,
        online: true,
        pending_count: await countPending(this.db),
        last_synced_at: new Date().toISOString(),
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

    return this.getState();
  }
}
