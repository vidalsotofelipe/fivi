-- fivi — arregla el rechazo sistemático de las porciones al editar un gasto.
--
-- SÍNTOMA
-- "No se pudo guardar en el servidor · N sin sincronizar", que sólo crecía. En
-- el servidor quedaban gastos con las porciones INCOMPLETAS (o sin ninguna):
-- p. ej. un gasto de 20.000,00 con 0 filas vivas en `expense_participants`.
--
-- CAUSA
-- `replaceExpense` (editar un gasto, y "sumar a alguien a gastos anteriores")
-- marcaba las porciones viejas como borradas (tombstone: la fila SE QUEDA) y
-- creaba filas nuevas con **otro id pero el mismo (expense_id, participant_id)**.
-- La restricción `unique (expense_id, participant_id)` de 0001 no distingue
-- tombstones, así que el `upsert` del push (con `onConflict: "id"`) chocaba con
-- ella → 409 → la operación se reintentaba 5 veces y quedaba agotada para
-- siempre.
--
-- SOLUCIÓN
-- La unicidad sólo tiene sentido entre filas VIVAS: una persona no puede tener
-- dos porciones activas en el mismo gasto, pero sí puede tener tombstones de
-- ediciones anteriores. Se reemplaza la constraint por un índice único PARCIAL.
--
-- Esto además **destraba solo** a los clientes que ya tienen operaciones
-- agotadas: al reintentar, esas filas ahora entran.
--
-- El cliente, además, dejó de generar pares duplicados (reusa el id de la fila
-- existente al recalcular el reparto), así que esto es la red de seguridad.
--
-- Aditiva en la práctica (afloja una restricción), idempotente. No toca datos.

alter table public.expense_participants
  drop constraint if exists expense_participants_expense_id_participant_id_key;

create unique index if not exists expense_participants_live_pair_idx
  on public.expense_participants (expense_id, participant_id)
  where deleted_at is null;

comment on index public.expense_participants_live_pair_idx is
  'Una sola porción VIVA por (gasto, participante). Los tombstones de ediciones anteriores no cuentan.';

-- ROLLBACK (volvería a romper la edición de gastos; sólo por completitud):
--   drop index if exists public.expense_participants_live_pair_idx;
--   alter table public.expense_participants
--     add constraint expense_participants_expense_id_participant_id_key
--     unique (expense_id, participant_id);
