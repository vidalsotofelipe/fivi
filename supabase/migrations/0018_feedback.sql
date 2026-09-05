-- Feedback de usuarios (reportar problemas, sugerencias, consultas, comentarios).
--
-- Tabla server-only: NO forma parte del motor de sync offline-first (no tiene
-- `deleted_at`/`version`/cola). Se crea una vez desde el endpoint público
-- (`/api/feedback`, service-role) y se gestiona sólo desde el panel admin
-- (`/api/admin/feedback/*`). RLS habilitada SIN políticas — igual que
-- `admin_audit_log` (0010) y `exchange_rates` (0014): sólo `service_role`
-- (que bypassa RLS) puede tocarla. Un usuario público no puede listar, leer,
-- ni modificar feedback ajeno por ningún camino que no sea nuestros propios
-- Route Handlers.
--
-- Deliberadamente NO se guarda nada del grupo/gasto del usuario (nombres,
-- montos, alias, emails de terceros): sólo lo que la propia persona escribe en
-- el formulario + metadata técnica del dispositivo/build.

create table if not exists public.feedback (
  id                 uuid primary key,
  type               text not null check (type in ('bug', 'suggestion', 'question', 'other')),
  title              text not null check (char_length(title) between 1 and 120),
  description        text not null check (char_length(description) between 1 and 4000),
  contact_email      text check (contact_email is null or char_length(contact_email) <= 200),
  -- Formulario dinámico de "Encontré un problema" (opcionales, cualquier tipo).
  steps_to_reproduce text check (steps_to_reproduce is null or char_length(steps_to_reproduce) <= 2000),
  expected_behavior  text check (expected_behavior is null or char_length(expected_behavior) <= 2000),
  -- Ruta dentro del bucket privado `feedback-screenshots`, NUNCA una URL
  -- pública: el panel admin genera una signed URL de corta vida al mostrarla.
  screenshot_path    text,
  status             text not null default 'new'
                       check (status in ('new', 'reviewing', 'planned', 'resolved', 'discarded')),
  -- Metadata técnica automática (sección "METADATA TÉCNICA" del pedido).
  app_version        text,
  environment        text,
  language           text check (language is null or char_length(language) <= 10),
  theme              text check (theme is null or char_length(theme) <= 10),
  browser            text check (browser is null or char_length(browser) <= 60),
  operating_system   text check (operating_system is null or char_length(operating_system) <= 60),
  device_type        text check (device_type is null or char_length(device_type) <= 20),
  viewport           text check (viewport is null or char_length(viewport) <= 20),
  -- Sólo el pathname (sin query/hash: ahí podrían viajar tokens de invitación
  -- u otros parámetros sensibles). Se sanitiza también en el servidor.
  page_path          text check (page_path is null or char_length(page_path) <= 200),
  user_agent         text check (user_agent is null or char_length(user_agent) <= 300),
  -- Id anónimo local del dispositivo, si ya existía uno (nunca se crea sólo
  -- para esto). No es un email ni un dato personal identificable.
  device_id          text check (device_id is null or char_length(device_id) <= 100),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists feedback_status_idx on public.feedback (status, created_at desc);
create index if not exists feedback_type_idx on public.feedback (type, created_at desc);
create index if not exists feedback_created_at_idx on public.feedback (created_at desc);
-- Antispam: cuenta envíos recientes del mismo dispositivo anónimo.
create index if not exists feedback_device_recent_idx on public.feedback (device_id, created_at desc);

alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;

-- ── Storage: bucket privado para las capturas adjuntas ──────────────────────
-- Guardado tras un `to_regclass`: el arnés de tests de RLS (pglite) no trae el
-- schema `storage` de Supabase, así que este bloque no-opea ahí sin romper
-- nada. En Supabase real crea el bucket una sola vez (`on conflict do nothing`).
-- Privado a propósito: las capturas se sirven con signed URLs de corta vida
-- generadas por el panel admin, nunca por URL pública fija.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('feedback-screenshots', 'feedback-screenshots', false)
    on conflict (id) do nothing;
  end if;
end $$;

-- ── RPC del panel admin (mismo patrón que 0011: agregación en SQL, sólo
--    service_role puede ejecutarlas) ────────────────────────────────────────

create or replace function public.admin_list_feedback(
  p_status  text        default null,
  p_type    text        default null,
  p_search  text        default null,
  p_from    timestamptz default null,
  p_to      timestamptz default null,
  p_version text        default null,
  p_env     text        default null,
  p_sort    text        default 'created_at',
  p_dir     text        default 'desc',
  p_limit   int         default 25,
  p_offset  int         default 0
) returns jsonb
language sql
stable
as $$
  with args as (
    select least(greatest(coalesce(p_limit, 25), 1), 100) as lim,
           greatest(coalesce(p_offset, 0), 0)             as off,
           case when lower(coalesce(p_dir, 'desc')) = 'asc' then 'asc' else 'desc' end as dir,
           case lower(coalesce(p_sort, 'created_at'))
             when 'status' then 'status'
             when 'type' then 'type'
             else 'created_at' end as sort
  ),
  base as (
    select f.id, f.type, f.title, f.description, f.status, f.contact_email,
           f.app_version, f.environment, f.created_at, f.updated_at,
           (f.screenshot_path is not null) as has_screenshot
      from public.feedback f
     where (p_status  is null or p_status  = '' or f.status      = p_status)
       and (p_type    is null or p_type    = '' or f.type        = p_type)
       and (p_version is null or p_version = '' or f.app_version = p_version)
       and (p_env     is null or p_env     = '' or f.environment = p_env)
       and (p_search  is null or p_search  = ''
            or f.title ilike '%' || p_search || '%'
            or f.description ilike '%' || p_search || '%')
       and (p_from is null or f.created_at >= p_from)
       and (p_to   is null or f.created_at <  p_to)
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'limit', (select lim from args),
    'offset', (select off from args),
    -- Contadores GLOBALES (ignoran los filtros activos): son el resumen fijo
    -- de arriba de la pantalla, no cambian al buscar/filtrar la tabla.
    'counts', jsonb_build_object(
      'total',      (select count(*) from public.feedback),
      'new',        (select count(*) from public.feedback where status = 'new'),
      'reviewing',  (select count(*) from public.feedback where status = 'reviewing'),
      'planned',    (select count(*) from public.feedback where status = 'planned'),
      'resolved',   (select count(*) from public.feedback where status = 'resolved'),
      'discarded',  (select count(*) from public.feedback where status = 'discarded')
    ),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(b))
        from (
          select base.* from base, args
           order by
             case when args.dir = 'asc'  and args.sort = 'status' then base.status end asc  nulls last,
             case when args.dir = 'desc' and args.sort = 'status' then base.status end desc nulls last,
             case when args.dir = 'asc'  and args.sort = 'type' then base.type end asc  nulls last,
             case when args.dir = 'desc' and args.sort = 'type' then base.type end desc nulls last,
             case when args.dir = 'asc'  and args.sort = 'created_at' then base.created_at end asc  nulls last,
             case when args.dir = 'desc' and args.sort = 'created_at' then base.created_at end desc nulls last,
             base.created_at desc
           limit (select lim from args) offset (select off from args)
        ) b
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.admin_list_feedback(
  text, text, text, timestamptz, timestamptz, text, text, text, text, int, int
) from public, anon, authenticated;

create or replace function public.admin_get_feedback(p_id uuid)
returns jsonb
language sql
stable
as $$
  select case when f.id is null then null else jsonb_build_object(
    'id', f.id, 'type', f.type, 'title', f.title, 'description', f.description,
    'contact_email', f.contact_email,
    'steps_to_reproduce', f.steps_to_reproduce, 'expected_behavior', f.expected_behavior,
    'status', f.status,
    'screenshot_path', f.screenshot_path,
    'app_version', f.app_version, 'environment', f.environment,
    'language', f.language, 'theme', f.theme, 'browser', f.browser,
    'operating_system', f.operating_system, 'device_type', f.device_type,
    'viewport', f.viewport, 'page_path', f.page_path, 'user_agent', f.user_agent,
    'created_at', f.created_at, 'updated_at', f.updated_at
  ) end
  from public.feedback f where f.id = p_id;
$$;
revoke all on function public.admin_get_feedback(uuid) from public, anon, authenticated;

create or replace function public.admin_set_feedback_status(p_id uuid, p_status text)
returns jsonb
language plpgsql
as $$
declare
  v_row public.feedback;
begin
  if p_status not in ('new', 'reviewing', 'planned', 'resolved', 'discarded') then
    raise exception 'estado inválido: %', p_status using errcode = 'P0001';
  end if;

  update public.feedback
     set status = p_status, updated_at = now()
   where id = p_id
   returning * into v_row;

  if v_row.id is null then
    raise exception 'feedback no encontrado' using errcode = 'P0002';
  end if;

  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'updated_at', v_row.updated_at);
end;
$$;
revoke all on function public.admin_set_feedback_status(uuid, text) from public, anon, authenticated;

-- Rollback (comentado a propósito, ver 0011):
-- drop function if exists public.admin_set_feedback_status(uuid, text);
-- drop function if exists public.admin_get_feedback(uuid);
-- drop function if exists public.admin_list_feedback(text,text,text,timestamptz,timestamptz,text,text,text,text,int,int);
-- drop table if exists public.feedback;
