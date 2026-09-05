-- fivi — "¿qué cambió?" al editar un gasto.
--
-- Antes un gasto editado sólo mostraba "Editado el {{fecha}}" (created_at vs
-- updated_at), sin decir qué cambió. Se agrega `previous_snapshot`: los
-- valores de descripción/monto/división justo ANTES de la última edición que
-- haya tocado alguno de los tres.
--
-- Diseño (versión liviana, no un historial completo):
--   * Columna `jsonb` ANULABLE, sin tabla nueva ni entidad de sync nueva.
--     Sólo guarda UN paso atrás (se sobrescribe en cada edición que cambie
--     algo) — alcanza para responder "¿quién cambió esto?" sin agregar una
--     tabla de auditoría. Coherente con el modelo actual: fila mutable +
--     tombstone, nada de historial append-only en ningún otro lado.
--   * Puramente informativa: no entra en ningún cálculo de saldos.
--   * La aplica `replaceExpense` en el cliente, comparando contra los valores
--     actuales antes de sobrescribir; si nada de eso cambió, no se toca.
--
-- Aditiva y backward-compatible: un frontend anterior ignora la columna.
-- Idempotente. NO modifica 0001..0018.

alter table public.expenses
  add column if not exists previous_snapshot jsonb;

comment on column public.expenses.previous_snapshot is
  'Descripción/monto/división justo antes de la última edición que los haya cambiado. Sólo el último paso, no un historial completo. Informativo, anulable.';

-- ROLLBACK (manual, sólo si hiciera falta revertir):
--   alter table public.expenses drop column if exists previous_snapshot;
