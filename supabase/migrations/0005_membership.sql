-- fivi — membresía de grupos (Etapa 7: seguridad de acceso).
--
-- PROBLEMA
-- Hasta 0004 el acceso a un grupo era "conocer el UUID = acceso total": las
-- policies de 0002 son `to anon using (true)`. Esta migración introduce el
-- modelo de membresía sobre el que 0007 reconstruye las policies.
--
-- MODELO
--   * groups.created_by   -> uuid del usuario (auth.users) que creó el grupo.
--   * group_members(group_id, user_id, role) -> quién puede acceder a qué grupo.
--     Roles: 'owner' (creador / administrador) y 'member'. Sin 'admin': el owner
--     cubre las acciones sensibles y agregar un tercer rol no aporta hoy.
--   * Al insertarse un grupo con una sesión autenticada, el creador queda como
--     'owner' automáticamente (trigger). El cliente no maneja group_members al
--     crear: es responsabilidad del servidor.
--
-- AUTENTICACIÓN
-- El cliente usa Supabase Anonymous Sign-In (sin email ni contraseña). Sin
-- Supabase configurado no hay auth y la app funciona 100% local (nunca llega
-- acá). `auth.uid()` es null cuando no hay sesión: los triggers lo contemplan.
--
-- Idempotente. NO modifica 0001..0004.

-- 1. groups.created_by --------------------------------------------------------
alter table public.groups
  add column if not exists created_by uuid references auth.users (id) on delete set null;

-- 2. group_members ----------------------------------------------------------
create table if not exists public.group_members (
  group_id   uuid        not null references public.groups (id) on delete cascade,
  user_id    uuid        not null references auth.users (id)    on delete cascade,
  role       text        not null default 'member'
                         check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_id_idx
  on public.group_members (user_id);

-- 3. Helpers de membresía --------------------------------------------------------
--    SECURITY DEFINER: corren como el dueño y saltean RLS, así una policy sobre
--    group_members puede llamarlas sin recursión infinita. `search_path` fijado;
--    todo va calificado. STABLE: el valor no cambia dentro de una sentencia.
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_group_owner(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id
      and user_id = (select auth.uid())
      and role = 'owner'
  );
$$;

revoke all on function public.is_group_member(uuid) from public;
revoke all on function public.is_group_owner(uuid) from public;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;

-- 4. Triggers sobre groups -----------------------------------------------------
-- 4a. created_by := el usuario actual (si hay sesión), en el INSERT.
create or replace function public.groups_set_created_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by := coalesce((select auth.uid()), new.created_by);
  return new;
end;
$$;
revoke all on function public.groups_set_created_by() from public;

drop trigger if exists groups_set_created_by on public.groups;
create trigger groups_set_created_by
  before insert on public.groups
  for each row execute function public.groups_set_created_by();

-- 4b. created_by es inmutable después del alta (un miembro no lo puede reasignar
--     vía un upsert de UPDATE). No cambia permisos —el rol vive en
--     group_members— pero evita que el campo de auditoría derive.
create or replace function public.groups_freeze_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := old.created_by;
  return new;
end;
$$;

drop trigger if exists groups_freeze_created_by on public.groups;
create trigger groups_freeze_created_by
  before update on public.groups
  for each row execute function public.groups_freeze_created_by();

-- 4c. el creador queda 'owner' apenas se inserta el grupo.
create or replace function public.groups_add_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    insert into public.group_members (group_id, user_id, role)
    values (new.id, (select auth.uid()), 'owner')
    on conflict (group_id, user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.groups_add_owner() from public;

drop trigger if exists groups_add_owner on public.groups;
create trigger groups_add_owner
  after insert on public.groups
  for each row execute function public.groups_add_owner();

-- 5. RLS de group_members ----------------------------------------------------
alter table public.group_members enable row level security;

drop policy if exists group_members_select on public.group_members;
create policy group_members_select on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id));

-- Alta directa: sólo el owner (el alta por invitación va por la RPC
-- redeem_group_invite, que es SECURITY DEFINER y no pasa por esta policy).
drop policy if exists group_members_insert on public.group_members;
create policy group_members_insert on public.group_members
  for insert to authenticated
  with check (public.is_group_owner(group_id));

drop policy if exists group_members_update on public.group_members;
create policy group_members_update on public.group_members
  for update to authenticated
  using (public.is_group_owner(group_id))
  with check (public.is_group_owner(group_id));

-- Baja: el owner saca a cualquiera; cualquiera puede salirse a sí mismo.
drop policy if exists group_members_delete on public.group_members;
create policy group_members_delete on public.group_members
  for delete to authenticated
  using (
    public.is_group_owner(group_id)
    or user_id = (select auth.uid())
  );

grant select, insert, update, delete on public.group_members to authenticated;
revoke all on public.group_members from anon;
