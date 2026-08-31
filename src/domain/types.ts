/**
 * Tipos del dominio de fivi.
 *
 * Estos tipos son la forma canónica de las entidades tanto en la base local
 * (IndexedDB / Dexie) como en el servidor (Supabase / Postgres). Toda entidad
 * sincronizable incluye los campos de control de sincronización.
 *
 * Convenciones de dinero: los importes se guardan SIEMPRE como enteros en la
 * unidad monetaria mínima ("minor units"). Ver `money.ts` y `currencies.ts`.
 */

/** Timestamp ISO 8601 en UTC, p. ej. "2026-08-29T12:34:56.000Z". */
export type IsoDateTime = string;

/** Fecha simple ISO (YYYY-MM-DD) sin hora, para fechas de gasto/pago. */
export type IsoDate = string;

/** Código ISO 4217 en mayúsculas, p. ej. "ARS", "USD", "CLP". */
export type CurrencyCode = string;

/**
 * Campos comunes a toda entidad que se sincroniza entre dispositivos.
 *
 * - `version` se incrementa en cada modificación local y sirve para detectar
 *   conflictos contra el servidor.
 * - `deleted_at` implementa soft delete / tombstone: nunca se borra una fila
 *   de forma definitiva en una operación de usuario.
 */
export interface SyncableRecord {
  id: string;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  version: number;
  deleted_at: IsoDateTime | null;
}

export interface Group extends SyncableRecord {
  name: string;
  description: string | null;
  /** Moneda principal del grupo. Obligatoria. Un grupo = una moneda. */
  currency_code: CurrencyCode;
  /**
   * Grupo archivado: se oculta de la lista principal (va a "Archivados") pero
   * NO se borra y se puede restaurar. `null` = activo. Se sincroniza como
   * cualquier campo del grupo (archivar en un dispositivo archiva en todos).
   */
  archived_at: IsoDateTime | null;
}

export interface Participant extends SyncableRecord {
  group_id: string;
  name: string;
}

/**
 * Estrategia de división de un gasto.
 *
 * En el MVP sólo se implementa `equal`. El tipo queda como unión discriminada
 * para poder incorporar más adelante montos, porcentajes, proporciones o
 * cantidades sin romper el modelo.
 */
export type SplitStrategy =
  | { kind: "equal" }
  | { kind: "amount"; amounts: Record<string, number> }
  | { kind: "percent"; percents: Record<string, number> }
  | { kind: "shares"; shares: Record<string, number> };

export interface Expense extends SyncableRecord {
  group_id: string;
  description: string;
  /** Importe total del gasto en unidades mínimas de la moneda del grupo. */
  amount_minor_units: number;
  /** id del participante que pagó. */
  paid_by: string;
  expense_date: IsoDate;
  split_strategy: SplitStrategy;
}

/**
 * Reparto concreto de un gasto: cuánto le toca a cada participante.
 * La suma de `share_minor_units` de un gasto es exactamente igual a
 * `Expense.amount_minor_units`.
 */
export interface ExpenseParticipant extends SyncableRecord {
  expense_id: string;
  participant_id: string;
  share_minor_units: number;
}

/** Pago directo de una persona a otra dentro del grupo (saldar deuda). */
export interface Payment extends SyncableRecord {
  group_id: string;
  from_participant: string;
  to_participant: string;
  amount_minor_units: number;
  payment_date: IsoDate;
}

/** Balance calculado de un participante (no se persiste; siempre derivado). */
export interface ParticipantBalance {
  participant_id: string;
  /** Total que puso esta persona (gastos que pagó + pagos que envió). */
  paid_minor: number;
  /** Total que le correspondía asumir (su parte de los gastos + pagos recibidos). */
  owed_minor: number;
  /** `paid_minor - owed_minor`. Positivo: debe recibir. Negativo: debe pagar. */
  balance_minor: number;
}

/** Transferencia sugerida para saldar cuentas. */
export interface Transfer {
  from_id: string;
  to_id: string;
  amount_minor: number;
}
