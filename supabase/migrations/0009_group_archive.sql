-- fivi — grupos archivables + snapshot para backup (Etapa 9).
--
-- Archivar un grupo lo saca de la lista principal de la app pero NO lo borra:
-- se puede restaurar. Es un flag (`groups.archived_at`) que se sincroniza como
-- cualquier campo del grupo (archivar en un dispositivo archiva en todos). La
-- app también archiva sola los grupos sin gastos ni pagos nuevos en 30 días.
--
-- Al archivarse, un trigger guarda un snapshot JSON completo del grupo en
-- `group_archives`: sirve como export/backup a futuro y sobrevive a una
-- eventual purga de archivados.
--
-- Aditiva y backward-compatible: un frontend anterior ignora `archived_at`.
-- Idempotente. NO modifica 0001..0008.

-- 1. Flag de archivado --------------------------------------------------------
alter table public.groups
  add column if not exists archived_at timestamptz;

-- 2. Snapshot de respaldo ----------------------------------------------------
create table if not exists public.group_archives (
  group_id    uuid        primary key references public.groups (id) on delete cascade,
  archived_at timestamptz not null default now(),
  archived_by uuid        references auth.users (id) on delete set null,
  snapshot    jsonb       not null
);

alter table public.group_archives enable row level security;

-- Sólo un miembro del grupo ve su snapshot.
drop policy if exists group_archives_select on public.group_archives;
create policy group_archives_select on public.group_archives
  for select to authenticated
  using (public.is_group_member(group_id));

grant select on public.group_archives to authenticated;
revoke all on public.group_archives from anon;

-- 3. Snapshot automático al archivar ---------------------------------------------
-- Se dispara cuando `archived_at` pasa de NULL a un valor, sea en INSERT o en
-- UPDATE (incluido el `upsert` del push del cliente). SECURITY DEFINER para
-- poder leer todas las tablas del grupo y escribir en `group_archives` sin
-- depender de las policies del usuario.
create or replace function public.snapshot_group_on_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.archived_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.archived_at is not null then
    return new;  -- ya estaba archivado: no re-snapshotear
  end if;

  insert into public.group_archives (group_id, archived_at, archived_by, snapshot)
  values (
    new.id,
    new.archived_at,
    (select auth.uid()),
    jsonb_build_object(
      'group', to_jsonb(new),
      'participants', (
        select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at), '[]'::jsonb)
        from public.participants p where p.group_id = new.id
      ),
      'expenses', (
        select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]'::jsonb)
        from public.expenses e where e.group_id = new.id
      ),
      'expense_participants', (
        select coalesce(jsonb_agg(to_jsonb(ep)), '[]'::jsonb)
        from public.expense_participants ep
        where ep.expense_id in (
          select id from public.expenses where group_id = new.id
        )
      ),
      'payments', (
        select coalesce(jsonb_agg(to_jsonb(pm) order by pm.created_at), '[]'::jsonb)
        from public.payments pm where pm.group_id = new.id
      )
    )
  )
  on conflict (group_id) do update
    set archived_at = excluded.archived_at,
        archived_by = excluded.archived_by,
        snapshot    = excluded.snapshot;

  return new;
end;
$$;
revoke all on function public.snapshot_group_on_archive() from public;

drop trigger if exists snapshot_group_on_archive on public.groups;
create trigger snapshot_group_on_archive
  after insert or update on public.groups
  for each row execute function public.snapshot_group_on_archive();
