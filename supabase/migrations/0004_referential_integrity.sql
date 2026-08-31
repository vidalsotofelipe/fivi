-- fivi — integridad referencial en el servidor (etapa de hardening, fase 5).
--
-- OBJETIVO
-- Que Postgres garantice, aunque el cliente tenga un bug o esté manipulado:
--   1. expenses.paid_by pertenece al MISMO grupo que expenses.group_id;
--   2. expense_participants.participant_id pertenece al grupo del expense;
--   3. payments.from_participant pertenece a payments.group_id;
--   4. payments.to_participant   pertenece a payments.group_id.
--
-- ENFOQUE
--   * (1)(3)(4): FKs COMPUESTAS contra participants (group_id, id). Requiere una
--     restricción UNIQUE (group_id, id) en participants como destino de la FK.
--   * (2): expense_participants no tiene group_id -> TRIGGER que valida contra el
--     grupo del expense. Evita agregar una columna (y tocar el modelo local).
--
-- Las FKs se validan en el push (upsert). El motor pushea en orden de
-- dependencia (groups -> participants -> expenses -> expense_participants ->
-- payments), así que un lote válido nunca se rechaza por orden. Si una fila
-- referencia algo que todavía no llegó, el upsert falla, el item vuelve a la
-- cola y reintenta con backoff (fase 2).
--
-- No toca `applyRemoteChanges` (escribe local, sin constraints).
-- Idempotente. NO modifica migraciones anteriores.

-- Destino de las FKs compuestas ------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'participants_group_id_id_key'
  ) then
    alter table public.participants
      add constraint participants_group_id_id_key unique (group_id, id);
  end if;
end $$;

-- 1. expenses.paid_by en el grupo del expense --------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_paid_by_group_fkey'
  ) then
    alter table public.expenses
      add constraint expenses_paid_by_group_fkey
      foreign key (group_id, paid_by)
      references public.participants (group_id, id);
  end if;
end $$;

-- 3 y 4. payments.from/to en el grupo del pago ------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payments_from_group_fkey'
  ) then
    alter table public.payments
      add constraint payments_from_group_fkey
      foreign key (group_id, from_participant)
      references public.participants (group_id, id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'payments_to_group_fkey'
  ) then
    alter table public.payments
      add constraint payments_to_group_fkey
      foreign key (group_id, to_participant)
      references public.participants (group_id, id);
  end if;
end $$;

-- 2. expense_participants.participant_id en el grupo del expense ------------
--    SECURITY DEFINER para que la validación vea el estado real de las tablas
--    aunque el rol que escribe tenga RLS restrictiva. `search_path` fijado.
create or replace function public.check_expense_participant_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expense_group uuid;
  participant_group uuid;
begin
  select group_id into expense_group
    from public.expenses where id = new.expense_id;
  select group_id into participant_group
    from public.participants where id = new.participant_id;

  if expense_group is null then
    raise exception 'expense_participants: expense % inexistente', new.expense_id;
  end if;
  if participant_group is null then
    raise exception 'expense_participants: participante % inexistente',
      new.participant_id;
  end if;
  if expense_group <> participant_group then
    raise exception
      'expense_participants: el participante % (grupo %) no pertenece al grupo del gasto (%)',
      new.participant_id, participant_group, expense_group;
  end if;

  return new;
end;
$$;
revoke all on function public.check_expense_participant_group() from public;

drop trigger if exists check_expense_participant_group
  on public.expense_participants;
create trigger check_expense_participant_group
  before insert or update on public.expense_participants
  for each row execute function public.check_expense_participant_group();
