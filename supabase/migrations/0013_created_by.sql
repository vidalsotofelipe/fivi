-- fivi — autoría del movimiento: quién REGISTRÓ el gasto / pago.
--
-- Hasta ahora la actividad ("Ana agregó el gasto") usaba `paid_by`, que es
-- quién PAGÓ, no quién cargó el movimiento. Se agrega `created_by` para
-- distinguir ambas cosas: es el id del participante que estaba usando el
-- dispositivo (su "yo" en el grupo) al crear el gasto/pago.
--
-- Diseño:
--   * Columna `uuid` ANULABLE, sin FK. Es puramente informativa (no entra en
--     ningún cálculo de saldos) y anulable a propósito: los movimientos
--     anteriores no la tienen y un dispositivo sin "yo" configurado la deja en
--     NULL. La app cae en `paid_by` cuando falta, así que el comportamiento
--     viejo se conserva.
--   * Sin FK para que el `upsert` del push nunca rechace una fila por este
--     campo (a diferencia de `paid_by`, que sí tiene FK compuesta en 0004).
--
-- Aditiva y backward-compatible: un frontend anterior ignora la columna.
-- Idempotente. NO modifica 0001..0012.

alter table public.expenses
  add column if not exists created_by uuid;

alter table public.payments
  add column if not exists created_by uuid;

comment on column public.expenses.created_by is
  'Participante que registró el gasto (el "yo" del dispositivo). Informativo, anulable; distinto de paid_by.';
comment on column public.payments.created_by is
  'Participante que registró el pago (el "yo" del dispositivo). Informativo, anulable.';

-- ROLLBACK (manual, sólo si hiciera falta revertir):
--   alter table public.expenses drop column if exists created_by;
--   alter table public.payments drop column if exists created_by;
