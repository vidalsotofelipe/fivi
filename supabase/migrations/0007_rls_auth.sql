-- fivi — RLS basada en auth.uid() + group_members (Etapa 7).
--
-- Reemplaza las policies permisivas de 0002 (`for select/insert/update to anon
-- using (true)`) por policies `to authenticated` que exigen membresía del grupo.
-- Al terminar:
--   * `anon` no tiene acceso a los datos privados de fivi;
--   * conocer el UUID de un grupo NO da acceso: hace falta estar en group_members
--     (por haber creado el grupo o por haber canjeado una invitación);
--   * sólo el owner puede tocar group_members / cambiar roles (ver 0005);
--   * los movimientos (participants/expenses/expense_participants/payments) sólo
--     los ve y edita un miembro del grupo.
--
-- NO se toca 0002 (las policies viejas se eliminan acá con `drop policy if
-- exists`). 0003 (sync_revision) y 0004 (integridad cross-group) siguen intactos
-- y componen: el trigger de sync_revision y las FKs compuestas se evalúan igual.
--
-- Realtime: `postgres_changes` aplica la policy de SELECT por suscriptor una vez
-- que el socket va autenticado con el JWT del usuario (el cliente llama
-- `realtime.setAuth(token)` tras el sign-in anónimo). La publicación de 0002
-- sigue siendo necesaria; `expense_participants` sigue reconciliándose por pull.
--
-- Idempotente.

-- 1. Fuera las policies permisivas de 0002 ---------------------------------------
drop policy if exists groups_sel on public.groups;
drop policy if exists groups_ins on public.groups;
drop policy if exists groups_upd on public.groups;
drop policy if exists participants_sel on public.participants;
drop policy if exists participants_ins on public.participants;
drop policy if exists participants_upd on public.participants;
drop policy if exists expenses_sel on public.expenses;
drop policy if exists expenses_ins on public.expenses;
drop policy if exists expenses_upd on public.expenses;
drop policy if exists expense_participants_sel on public.expense_participants;
drop policy if exists expense_participants_ins on public.expense_participants;
drop policy if exists expense_participants_upd on public.expense_participants;
drop policy if exists payments_sel on public.payments;
drop policy if exists payments_ins on public.payments;
drop policy if exists payments_upd on public.payments;

-- 2. Helper para expense_participants (no tiene group_id) ----------------------
--    Resuelve el grupo vía el expense padre, salteando RLS (SECURITY DEFINER)
--    para no depender de la policy de `expenses` de forma recursiva.
create or replace function public.can_access_expense(p_expense_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.expenses e
    where e.id = p_expense_id
      and public.is_group_member(e.group_id)
  );
$$;
revoke all on function public.can_access_expense(uuid) from public;
grant execute on function public.can_access_expense(uuid) to authenticated;

-- 3. groups -----------------------------------------------------------------
--    Leer/editar: cualquier miembro. Crear: cualquier usuario autenticado (el
--    trigger de 0005 fija created_by y lo vuelve owner). El borrado del grupo es
--    soft-delete (UPDATE de deleted_at); se permite a cualquier miembro, igual
--    que editar el contenido del grupo (es reversible por LWW). Endurecerlo a
--    "sólo owner" es cambiar el WITH CHECK de abajo.
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select to authenticated
  using (public.is_group_member(id));

drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups
  for insert to authenticated
  with check ((select auth.uid()) is not null);

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups
  for update to authenticated
  using (public.is_group_member(id))
  with check (public.is_group_member(id));

-- 4. participants / expenses / payments (tienen group_id) ---------------------
drop policy if exists participants_select on public.participants;
create policy participants_select on public.participants
  for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists participants_insert on public.participants;
create policy participants_insert on public.participants
  for insert to authenticated
  with check (public.is_group_member(group_id));

drop policy if exists participants_update on public.participants;
create policy participants_update on public.participants
  for update to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
  for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses
  for insert to authenticated
  with check (public.is_group_member(group_id));

drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses
  for update to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments
  for insert to authenticated
  with check (public.is_group_member(group_id));

drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments
  for update to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

-- 5. expense_participants (pertenece al grupo vía el expense) ------------------
drop policy if exists expense_participants_select on public.expense_participants;
create policy expense_participants_select on public.expense_participants
  for select to authenticated
  using (public.can_access_expense(expense_id));

drop policy if exists expense_participants_insert on public.expense_participants;
create policy expense_participants_insert on public.expense_participants
  for insert to authenticated
  with check (public.can_access_expense(expense_id));

drop policy if exists expense_participants_update on public.expense_participants;
create policy expense_participants_update on public.expense_participants
  for update to authenticated
  using (public.can_access_expense(expense_id))
  with check (public.can_access_expense(expense_id));

-- Nota: sin policy de DELETE en las 5 tablas de datos -> `anon` y `authenticated`
-- no pueden borrar filas físicamente (todo es soft-delete vía deleted_at), igual
-- que en 0002.

-- ---------------------------------------------------------------------------
-- TRANSICIÓN DE GRUPOS EXISTENTES (paso manual, si aplica)
--
-- Los grupos creados antes de esta migración no tienen created_by ni filas en
-- group_members: tras aplicar 0007 quedan invisibles para todos. Las migraciones
-- NO inventan propietarios. Si hay grupos que conservar, el dueño del proyecto
-- debe correr UNA vez, reemplazando <TU-UID> por su `auth.users.id` (visible en
-- Authentication -> Users tras entrar a la app, o `select id from auth.users`):
--
--   insert into public.group_members (group_id, user_id, role)
--   select g.id, '<TU-UID>'::uuid, 'owner'
--   from public.groups g
--   where not exists (
--     select 1 from public.group_members m where m.group_id = g.id
--   );
--   update public.groups set created_by = '<TU-UID>'::uuid where created_by is null;
-- ---------------------------------------------------------------------------
