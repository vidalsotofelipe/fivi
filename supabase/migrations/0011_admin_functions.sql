-- fivi — funciones de sólo-lectura y acciones del panel admin (Etapa 11).
--
-- Complementa 0010_admin.sql. Toda la agregación se hace en SQL: el backend
-- (`src/app/api/admin/*`, que ya verificó `requireAdmin`) llama a estas
-- funciones con el cliente service-role y nunca baja filas para calcular.
--
-- `revoke ... from public, anon, authenticated`: sólo `service_role` (que
-- bypassa RLS) puede ejecutarlas. Aditiva. NO modifica datos de la app.
-- Rollback = `drop function ...` (bloque comentado al pie).
--
-- LIMITACIÓN del modelo: `expenses` / `payments` NO tienen `created_by`, así que
-- un movimiento no se puede atribuir a un usuario. Ver docs/ADMIN.md.

-- ── 1. Dashboard ───────────────────────────────────────────────────────────
create or replace function public.admin_dashboard(
  p_from      timestamptz,
  p_to        timestamptz,
  p_prev_from timestamptz,
  p_prev_to   timestamptz
) returns jsonb
language sql
stable
as $$
  with
  mov as (
    select 'expense'::text as kind, e.created_at, e.amount_minor_units as amount, g.currency_code
      from public.expenses e join public.groups g on g.id = e.group_id
     where e.deleted_at is null and g.deleted_at is null
    union all
    select 'payment', p.created_at, p.amount_minor_units, g.currency_code
      from public.payments p join public.groups g on g.id = p.group_id
     where p.deleted_at is null and g.deleted_at is null
  ),
  u as (
    select id, created_at, coalesce(is_anonymous, true) as is_anon, email
      from auth.users
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to,
                                'prev_from', p_prev_from, 'prev_to', p_prev_to),
    'users', jsonb_build_object(
      'total',        (select count(*) from u),
      'anonymous',    (select count(*) from u where is_anon),
      'with_email',   (select count(*) from u where email is not null),
      'new_in_range', (select count(*) from u where created_at >= p_from and created_at < p_to),
      'new_prev',     (select count(*) from u where created_at >= p_prev_from and created_at < p_prev_to),
      'new_7d',       (select count(*) from u where created_at >= now() - interval '7 days'),
      'new_30d',      (select count(*) from u where created_at >= now() - interval '30 days')
    ),
    'groups', jsonb_build_object(
      'total',        (select count(*) from public.groups where deleted_at is null and archived_at is null),
      'archived',     (select count(*) from public.groups where deleted_at is null and archived_at is not null),
      'new_in_range', (select count(*) from public.groups where deleted_at is null and created_at >= p_from and created_at < p_to),
      'new_prev',     (select count(*) from public.groups where deleted_at is null and created_at >= p_prev_from and created_at < p_prev_to)
    ),
    'movements', jsonb_build_object(
      'total',      (select count(*) from mov),
      'in_range',   (select count(*) from mov where created_at >= p_from and created_at < p_to),
      'prev',       (select count(*) from mov where created_at >= p_prev_from and created_at < p_prev_to),
      'this_month', (select count(*) from mov where created_at >= date_trunc('month', now())),
      'last_at',    (select max(created_at) from mov),
      'by_type',    (select coalesce(jsonb_agg(jsonb_build_object('type', kind, 'count', c) order by kind), '[]'::jsonb)
                       from (select kind, count(*) c from mov
                              where created_at >= p_from and created_at < p_to group by kind) t)
    ),
    'volume_in_range', (
      select coalesce(jsonb_agg(jsonb_build_object('currency', currency_code,
               'total_minor', total, 'count', c) order by currency_code), '[]'::jsonb)
        from (select currency_code, sum(amount)::bigint total, count(*) c from mov
               where created_at >= p_from and created_at < p_to group by currency_code) v
    ),
    'volume_this_month', (
      select coalesce(jsonb_agg(jsonb_build_object('currency', currency_code,
               'total_minor', total) order by currency_code), '[]'::jsonb)
        from (select currency_code, sum(amount)::bigint total from mov
               where created_at >= date_trunc('month', now()) group by currency_code) v
    ),
    'monthly', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'month',      to_char(mo, 'YYYY-MM'),
               'movements',  coalesce(mv.c, 0),
               'new_groups', coalesce(gr.c, 0),
               'new_users',  coalesce(us.c, 0)) order by mo), '[]'::jsonb)
        from generate_series(date_trunc('month', now()) - interval '11 months',
                             date_trunc('month', now()), interval '1 month') mo
        left join (select date_trunc('month', created_at) m, count(*) c from mov group by 1) mv on mv.m = mo
        left join (select date_trunc('month', created_at) m, count(*) c from public.groups
                    where deleted_at is null group by 1) gr on gr.m = mo
        left join (select date_trunc('month', created_at) m, count(*) c from auth.users group by 1) us on us.m = mo
    ),
    'recent_users', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', id, 'created_at', created_at,
               'is_anonymous', is_anon, 'email', email) order by created_at desc), '[]'::jsonb)
        from (select id, created_at, is_anon, email from u order by created_at desc limit 5) r
    ),
    'recent_activity', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'type', kind, 'currency', currency_code,
               'amount_minor', amount, 'created_at', created_at) order by created_at desc), '[]'::jsonb)
        from (select kind, currency_code, amount, created_at from mov
               order by created_at desc limit 10) r
    )
  )
$$;
revoke all on function public.admin_dashboard(timestamptz, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;

-- ── 2. Listado de usuarios ────────────────────────────────────────────────
-- Orden: whitelist estática (created_at | last_sign_in_at | email) + dir; sin
-- SQL dinámico. `p_status`: active | banned. `p_role`: admin | user.
create or replace function public.admin_list_users(
  p_search text        default null,
  p_status text        default null,
  p_role   text        default null,
  p_from   timestamptz default null,
  p_to     timestamptz default null,
  p_sort   text        default 'created_at',
  p_dir    text        default 'desc',
  p_limit  int         default 25,
  p_offset int         default 0
) returns jsonb
language sql
stable
as $$
  with args as (
    select least(greatest(coalesce(p_limit, 25), 1), 100)      as lim,
           greatest(coalesce(p_offset, 0), 0)                   as off,
           case when lower(coalesce(p_dir, 'desc')) = 'asc' then 'asc' else 'desc' end as dir,
           case lower(coalesce(p_sort, 'created_at'))
             when 'last_sign_in_at' then 'last_sign_in_at'
             when 'email' then 'email'
             else 'created_at' end                              as sort
  ),
  base as (
    select u.id, u.email, coalesce(u.is_anonymous, true) as is_anonymous,
           u.created_at, u.last_sign_in_at, u.banned_until,
           exists(select 1 from public.app_admins a where a.user_id = u.id) as is_admin,
           (select count(*) from public.groups g
             where g.created_by = u.id and g.deleted_at is null)            as groups_owned,
           (select count(*) from public.group_members m where m.user_id = u.id) as groups_member
      from auth.users u
     where (p_search is null or p_search = ''
            or u.email ilike '%' || p_search || '%'
            or u.id::text ilike '%' || p_search || '%')
       and (p_from is null or u.created_at >= p_from)
       and (p_to   is null or u.created_at <  p_to)
       and (p_status is null or p_status = ''
            or (p_status = 'banned' and u.banned_until is not null and u.banned_until > now())
            or (p_status = 'active' and (u.banned_until is null or u.banned_until <= now())))
       and (p_role is null or p_role = ''
            or (p_role = 'admin' and exists(select 1 from public.app_admins a where a.user_id = u.id))
            or (p_role = 'user'  and not exists(select 1 from public.app_admins a where a.user_id = u.id)))
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'limit', (select lim from args),
    'offset', (select off from args),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(b))
        from (
          select base.* from base, args
           order by
             case when args.dir = 'asc'  and args.sort = 'created_at'      then base.created_at end asc  nulls last,
             case when args.dir = 'desc' and args.sort = 'created_at'      then base.created_at end desc nulls last,
             case when args.dir = 'asc'  and args.sort = 'last_sign_in_at' then base.last_sign_in_at end asc  nulls last,
             case when args.dir = 'desc' and args.sort = 'last_sign_in_at' then base.last_sign_in_at end desc nulls last,
             case when args.dir = 'asc'  and args.sort = 'email'           then lower(base.email) end asc  nulls last,
             case when args.dir = 'desc' and args.sort = 'email'           then lower(base.email) end desc nulls last,
             base.created_at desc
           limit (select lim from args) offset (select off from args)
        ) b
    ), '[]'::jsonb)
  )
$$;
revoke all on function public.admin_list_users(text, text, text, timestamptz, timestamptz, text, text, int, int)
  from public, anon, authenticated;

create or replace function public.admin_get_user(p_uid uuid)
returns jsonb
language sql
stable
as $$
  select case when u.id is null then null else jsonb_build_object(
    'user', jsonb_build_object(
      'id', u.id, 'email', u.email, 'is_anonymous', coalesce(u.is_anonymous, true),
      'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
      'banned_until', u.banned_until,
      'is_admin', exists(select 1 from public.app_admins a where a.user_id = u.id)),
    'groups_created', (select count(*) from public.groups g
                        where g.created_by = u.id and g.deleted_at is null),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object(
                 'id', g.id, 'name', g.name, 'currency_code', g.currency_code,
                 'role', m.role, 'created_at', g.created_at, 'archived_at', g.archived_at)
               order by g.created_at desc), '[]'::jsonb)
       from public.group_members m join public.groups g on g.id = m.group_id
      where m.user_id = u.id and g.deleted_at is null)
  ) end
  from (select * from auth.users where id = p_uid) u
$$;
revoke all on function public.admin_get_user(uuid) from public, anon, authenticated;

-- ── 3. Listado de grupos ──────────────────────────────────────────────────
create or replace function public.admin_list_groups(
  p_search   text        default null,
  p_currency text        default null,
  p_archived text        default null,   -- 'yes' | 'no'
  p_from     timestamptz default null,
  p_to       timestamptz default null,
  p_sort     text        default 'created_at',
  p_dir      text        default 'desc',
  p_limit    int         default 25,
  p_offset   int         default 0
) returns jsonb
language sql
stable
as $$
  with args as (
    select least(greatest(coalesce(p_limit, 25), 1), 100) as lim,
           greatest(coalesce(p_offset, 0), 0)             as off,
           case when lower(coalesce(p_dir, 'desc')) = 'asc' then 'asc' else 'desc' end as dir,
           case lower(coalesce(p_sort, 'created_at'))
             when 'name' then 'name'
             when 'expense_count' then 'expense_count'
             when 'participant_count' then 'participant_count'
             else 'created_at' end as sort
  ),
  base as (
    select g.id, g.name, g.description, g.currency_code, g.created_at, g.archived_at, g.created_by,
           (select count(*) from public.participants p where p.group_id = g.id and p.deleted_at is null) as participant_count,
           (select count(*) from public.expenses e where e.group_id = g.id and e.deleted_at is null)     as expense_count,
           (select count(*) from public.payments pm where pm.group_id = g.id and pm.deleted_at is null)  as payment_count,
           (select coalesce(sum(e.amount_minor_units), 0)::bigint from public.expenses e
             where e.group_id = g.id and e.deleted_at is null)                                           as expense_total_minor,
           (select count(*) from public.group_members m where m.group_id = g.id)                         as member_count
      from public.groups g
     where g.deleted_at is null
       and (p_search is null or p_search = '' or g.name ilike '%' || p_search || '%')
       and (p_currency is null or p_currency = '' or g.currency_code = upper(p_currency))
       and (p_archived is null or p_archived = ''
            or (p_archived = 'yes' and g.archived_at is not null)
            or (p_archived = 'no'  and g.archived_at is null))
       and (p_from is null or g.created_at >= p_from)
       and (p_to   is null or g.created_at <  p_to)
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'limit', (select lim from args),
    'offset', (select off from args),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(b))
        from (
          select base.* from base, args
           order by
             case when args.dir = 'asc'  and args.sort = 'name' then lower(base.name) end asc  nulls last,
             case when args.dir = 'desc' and args.sort = 'name' then lower(base.name) end desc nulls last,
             case when args.dir = 'asc'  and args.sort = 'expense_count' then base.expense_count end asc  nulls last,
             case when args.dir = 'desc' and args.sort = 'expense_count' then base.expense_count end desc nulls last,
             case when args.dir = 'asc'  and args.sort = 'participant_count' then base.participant_count end asc  nulls last,
             case when args.dir = 'desc' and args.sort = 'participant_count' then base.participant_count end desc nulls last,
             case when args.dir = 'asc'  and args.sort = 'created_at' then base.created_at end asc  nulls last,
             case when args.dir = 'desc' and args.sort = 'created_at' then base.created_at end desc nulls last,
             base.created_at desc
           limit (select lim from args) offset (select off from args)
        ) b
    ), '[]'::jsonb)
  )
$$;
revoke all on function public.admin_list_groups(text, text, text, timestamptz, timestamptz, text, text, int, int)
  from public, anon, authenticated;

create or replace function public.admin_get_group(p_gid uuid)
returns jsonb
language sql
stable
as $$
  select case when g.id is null then null else jsonb_build_object(
    'group', jsonb_build_object(
      'id', g.id, 'name', g.name, 'description', g.description,
      'currency_code', g.currency_code, 'created_at', g.created_at,
      'updated_at', g.updated_at, 'archived_at', g.archived_at, 'created_by', g.created_by),
    'participants', (select coalesce(jsonb_agg(jsonb_build_object(
                       'id', p.id, 'name', p.name, 'created_at', p.created_at) order by p.created_at), '[]'::jsonb)
       from public.participants p where p.group_id = g.id and p.deleted_at is null),
    'members', (select coalesce(jsonb_agg(jsonb_build_object(
                 'user_id', m.user_id, 'role', m.role) order by m.role), '[]'::jsonb)
       from public.group_members m where m.group_id = g.id),
    'expenses', jsonb_build_object(
      'count', (select count(*) from public.expenses e where e.group_id = g.id and e.deleted_at is null),
      'total_minor', (select coalesce(sum(e.amount_minor_units), 0)::bigint from public.expenses e
                       where e.group_id = g.id and e.deleted_at is null)),
    'payments', jsonb_build_object(
      'count', (select count(*) from public.payments pm where pm.group_id = g.id and pm.deleted_at is null),
      'total_minor', (select coalesce(sum(pm.amount_minor_units), 0)::bigint from public.payments pm
                       where pm.group_id = g.id and pm.deleted_at is null))
  ) end
  from (select * from public.groups where id = p_gid) g
$$;
revoke all on function public.admin_get_group(uuid) from public, anon, authenticated;

-- ── 4. Movimientos (gastos + pagos unificados, sólo lectura) ───────────────
create or replace function public.admin_list_movements(
  p_type     text        default null,   -- 'expense' | 'payment'
  p_group    uuid        default null,
  p_currency text        default null,
  p_search   text        default null,
  p_from     timestamptz default null,
  p_to       timestamptz default null,
  p_sort     text        default 'created_at',
  p_dir      text        default 'desc',
  p_limit    int         default 25,
  p_offset   int         default 0
) returns jsonb
language sql
stable
as $$
  with args as (
    select least(greatest(coalesce(p_limit, 25), 1), 500) as lim,
           greatest(coalesce(p_offset, 0), 0)             as off,
           case when lower(coalesce(p_dir, 'desc')) = 'asc' then 'asc' else 'desc' end as dir,
           case lower(coalesce(p_sort, 'created_at'))
             when 'amount_minor' then 'amount_minor'
             when 'occurred_on' then 'occurred_on'
             else 'created_at' end as sort
  ),
  mov as (
    select 'expense'::text as type, e.id, e.group_id, g.name as group_name, g.currency_code as currency,
           e.amount_minor_units as amount_minor, e.description, e.expense_date as occurred_on,
           e.created_at, e.updated_at
      from public.expenses e join public.groups g on g.id = e.group_id
     where e.deleted_at is null and g.deleted_at is null
    union all
    select 'payment', pm.id, pm.group_id, g.name, g.currency_code,
           pm.amount_minor_units, null, pm.payment_date, pm.created_at, pm.updated_at
      from public.payments pm join public.groups g on g.id = pm.group_id
     where pm.deleted_at is null and g.deleted_at is null
  ),
  base as (
    select * from mov
     where (p_type is null or p_type = '' or type = p_type)
       and (p_group is null or group_id = p_group)
       and (p_currency is null or p_currency = '' or currency = upper(p_currency))
       and (p_search is null or p_search = ''
            or coalesce(description, '') ilike '%' || p_search || '%'
            or group_name ilike '%' || p_search || '%')
       and (p_from is null or created_at >= p_from)
       and (p_to   is null or created_at <  p_to)
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'limit', (select lim from args),
    'offset', (select off from args),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(b))
        from (
          select base.* from base, args
           order by
             case when args.dir = 'asc'  and args.sort = 'created_at'   then base.created_at end asc  nulls last,
             case when args.dir = 'desc' and args.sort = 'created_at'   then base.created_at end desc nulls last,
             case when args.dir = 'asc'  and args.sort = 'amount_minor' then base.amount_minor end asc  nulls last,
             case when args.dir = 'desc' and args.sort = 'amount_minor' then base.amount_minor end desc nulls last,
             case when args.dir = 'asc'  and args.sort = 'occurred_on'  then base.occurred_on end asc  nulls last,
             case when args.dir = 'desc' and args.sort = 'occurred_on'  then base.occurred_on end desc nulls last,
             base.created_at desc, base.id
           limit (select lim from args) offset (select off from args)
        ) b
    ), '[]'::jsonb)
  )
$$;
revoke all on function public.admin_list_movements(text, uuid, text, text, timestamptz, timestamptz, text, text, int, int)
  from public, anon, authenticated;

-- ── 5. Auditoría ──────────────────────────────────────────────────────────
create or replace function public.admin_audit_query(
  p_admin  uuid        default null,
  p_action text        default null,
  p_entity text        default null,
  p_from   timestamptz default null,
  p_to     timestamptz default null,
  p_limit  int         default 50,
  p_offset int         default 0
) returns jsonb
language sql
stable
as $$
  with args as (
    select least(greatest(coalesce(p_limit, 50), 1), 200) as lim,
           greatest(coalesce(p_offset, 0), 0)             as off
  ),
  base as (
    select l.* from public.admin_audit_log l
     where (p_admin  is null or l.admin_user_id = p_admin)
       and (p_action is null or p_action = '' or l.action = p_action)
       and (p_entity is null or p_entity = '' or l.entity = p_entity)
       and (p_from   is null or l.created_at >= p_from)
       and (p_to     is null or l.created_at <  p_to)
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'limit', (select lim from args),
    'offset', (select off from args),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.created_at desc, b.id desc)
        from (select * from base order by created_at desc, id desc
              limit (select lim from args) offset (select off from args)) b
    ), '[]'::jsonb)
  )
$$;
revoke all on function public.admin_audit_query(uuid, text, text, timestamptz, timestamptz, int, int)
  from public, anon, authenticated;

-- ── 6. Acciones (mutaciones; el endpoint audita el resultado) ──────────────
create or replace function public.admin_set_user_admin(p_uid uuid, p_make boolean, p_by uuid)
returns jsonb
language plpgsql
as $$
declare v_cnt int;
begin
  if p_make then
    insert into public.app_admins (user_id, granted_by)
    values (p_uid, p_by)
    on conflict (user_id) do nothing;
  else
    select count(*) into v_cnt from public.app_admins;
    if v_cnt <= 1 and exists (select 1 from public.app_admins where user_id = p_uid) then
      raise exception 'No se puede quitar el último administrador' using errcode = 'P0001';
    end if;
    delete from public.app_admins where user_id = p_uid;
  end if;
  return jsonb_build_object(
    'is_admin', exists (select 1 from public.app_admins where user_id = p_uid),
    'admin_count', (select count(*) from public.app_admins)
  );
end;
$$;
revoke all on function public.admin_set_user_admin(uuid, boolean, uuid) from public, anon, authenticated;

create or replace function public.admin_set_user_ban(p_uid uuid, p_ban boolean)
returns jsonb
language plpgsql
as $$
begin
  if p_ban and exists (select 1 from public.app_admins where user_id = p_uid) then
    raise exception 'No se puede desactivar a un administrador' using errcode = 'P0001';
  end if;
  update auth.users
     set banned_until = case when p_ban then 'infinity'::timestamptz else null end
   where id = p_uid;
  if not found then
    raise exception 'Usuario no encontrado' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'banned_until', (select banned_until from auth.users where id = p_uid)
  );
end;
$$;
revoke all on function public.admin_set_user_ban(uuid, boolean) from public, anon, authenticated;

create or replace function public.admin_settings_get()
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.admin_settings
$$;
revoke all on function public.admin_settings_get() from public, anon, authenticated;

create or replace function public.admin_settings_set(p_key text, p_value jsonb, p_by uuid)
returns jsonb
language sql
as $$
  insert into public.admin_settings (key, value, updated_at, updated_by)
  values (p_key, p_value, now(), p_by)
  on conflict (key) do update
    set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by
  returning jsonb_build_object('key', key, 'value', value, 'updated_at', updated_at)
$$;
revoke all on function public.admin_settings_set(text, jsonb, uuid) from public, anon, authenticated;

-- Sólo el backend (service_role, que además bypassa RLS) puede ejecutarlas.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure::text as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname ~ '^admin_'
  loop
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- ROLLBACK (no toca datos de la app):
--   drop function if exists public.admin_dashboard(timestamptz,timestamptz,timestamptz,timestamptz);
--   drop function if exists public.admin_list_users(text,text,text,timestamptz,timestamptz,text,text,int,int);
--   drop function if exists public.admin_get_user(uuid);
--   drop function if exists public.admin_list_groups(text,text,text,timestamptz,timestamptz,text,text,int,int);
--   drop function if exists public.admin_get_group(uuid);
--   drop function if exists public.admin_list_movements(text,uuid,text,text,timestamptz,timestamptz,text,text,int,int);
--   drop function if exists public.admin_audit_query(uuid,text,text,timestamptz,timestamptz,int,int);
--   drop function if exists public.admin_set_user_admin(uuid,boolean,uuid);
--   drop function if exists public.admin_set_user_ban(uuid,boolean);
--   drop function if exists public.admin_settings_get();
--   drop function if exists public.admin_settings_set(text,jsonb,uuid);
