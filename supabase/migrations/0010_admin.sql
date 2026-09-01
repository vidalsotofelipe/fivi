-- fivi — panel de administración general (Etapa 11).
--
-- Aditiva y NO destructiva: crea tablas nuevas para administradores globales,
-- auditoría del panel y configuración; agrega índices para las consultas
-- agregadas del panel. NO modifica 0001..0009 ni borra datos.
--
-- Las tablas nuevas SÓLO las toca el backend (Route Handlers con service-role):
-- RLS activada sin policies => el cliente (`anon` / `authenticated`) no puede
-- leerlas ni escribirlas. `service_role` bypassa RLS.
--
-- Rollback documentado al pie.

-- 1. Administradores globales de la app ---------------------------------------
create table if not exists public.app_admins (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  granted_by uuid        references auth.users (id) on delete set null,
  granted_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

-- Defensa en profundidad: nunca se puede quedar sin ningún administrador.
create or replace function public.app_admins_prevent_last_delete()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.app_admins) <= 1 then
    raise exception 'No se puede quitar el último administrador'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists app_admins_prevent_last_delete on public.app_admins;
create trigger app_admins_prevent_last_delete
  before delete on public.app_admins
  for each row execute function public.app_admins_prevent_last_delete();

-- 2. Auditoría de acciones del panel -----------------------------------------
create table if not exists public.admin_audit_log (
  id            bigint      generated always as identity primary key,
  admin_user_id uuid        references auth.users (id) on delete set null,
  action        text        not null,
  entity        text,
  entity_id     text,
  result        text        not null default 'ok',
  metadata      jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_admin_idx
  on public.admin_audit_log (admin_user_id, created_at desc);
create index if not exists admin_audit_log_action_idx
  on public.admin_audit_log (action);
create index if not exists admin_audit_log_entity_idx
  on public.admin_audit_log (entity, entity_id);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;

-- 3. Configuración general (tabla lista; opciones se validan en el backend) ----
create table if not exists public.admin_settings (
  key        text        primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  updated_by uuid        references auth.users (id) on delete set null
);
alter table public.admin_settings enable row level security;
revoke all on public.admin_settings from anon, authenticated;

insert into public.admin_settings (key, value) values
  ('default_currency', '"ARS"'::jsonb),
  ('feature_flags',    '{}'::jsonb)
on conflict (key) do nothing;

-- 4. Índices para las consultas agregadas del panel --------------------------
-- El dashboard filtra por rango de `created_at` (fecha de alta del registro).
-- Sin estos índices serían full-scans. `expenses`/`payments` NO tienen
-- `created_by` en el modelo actual (no se atribuye el movimiento a un usuario),
-- así que no se indexa por ahí; ver docs/ADMIN.md § Limitaciones.
create index if not exists expenses_created_at_idx     on public.expenses (created_at);
create index if not exists payments_created_at_idx     on public.payments (created_at);
create index if not exists groups_created_at_idx       on public.groups (created_at);
create index if not exists participants_created_at_idx on public.participants (created_at);
create index if not exists groups_created_by_idx       on public.groups (created_by);

-- ───────────────────────────────────────────────────────────────────────────
-- ROLLBACK (revierte esta migración sin tocar datos de la app):
--
--   drop trigger  if exists app_admins_prevent_last_delete on public.app_admins;
--   drop function if exists public.app_admins_prevent_last_delete();
--   drop table    if exists public.admin_audit_log;
--   drop table    if exists public.admin_settings;
--   drop table    if exists public.app_admins;
--   drop index    if exists public.expenses_created_at_idx;
--   drop index    if exists public.payments_created_at_idx;
--   drop index    if exists public.groups_created_at_idx;
--   drop index    if exists public.participants_created_at_idx;
--   drop index    if exists public.groups_created_by_idx;
