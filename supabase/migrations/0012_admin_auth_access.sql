-- fivi — acceso a `auth.users` desde las funciones del panel admin.
--
-- Problema: `service_role` tiene USAGE sobre el esquema `auth` pero NO SELECT
-- sobre `auth.users`. Las funciones de 0011 son SECURITY INVOKER, así que al
-- llamarlas por PostgREST (rol `service_role`) las que leen usuarios fallaban:
-- /api/admin/users daba 500 y /api/admin/metrics devolvía vacío, mientras que
-- las que sólo tocan `public` (grupos, movimientos, auditoría) funcionaban.
--
-- Solución: las CUATRO funciones que tocan `auth.users` pasan a SECURITY
-- DEFINER. Corren con los privilegios del dueño (`postgres`), que sí puede leer
-- `auth.users`. Es el patrón estándar en Supabase para exponer datos de `auth`.
--
-- Por qué es seguro:
--   * siguen con `revoke ... from public, anon, authenticated` (0011): sólo
--     `service_role` puede ejecutarlas, y a él sólo llega el backend después de
--     `requireAdmin`;
--   * no arman SQL dinámico (el orden sale de una whitelist estática), así que
--     no hay superficie de inyección;
--   * se les fija `search_path` explícito para que un esquema en el path del
--     invocante no pueda secuestrar la resolución de nombres.
--
-- Aditiva: NO cambia cuerpos ni firmas, sólo atributos. Rollback al pie.

-- 1. Lectura de usuarios ------------------------------------------------------
alter function public.admin_dashboard(timestamptz, timestamptz, timestamptz, timestamptz)
  security definer;
alter function public.admin_dashboard(timestamptz, timestamptz, timestamptz, timestamptz)
  set search_path = public, auth, pg_temp;

alter function public.admin_list_users(text, text, text, timestamptz, timestamptz, text, text, int, int)
  security definer;
alter function public.admin_list_users(text, text, text, timestamptz, timestamptz, text, text, int, int)
  set search_path = public, auth, pg_temp;

alter function public.admin_get_user(uuid) security definer;
alter function public.admin_get_user(uuid) set search_path = public, auth, pg_temp;

-- 2. Alta/baja lógica de un usuario (escribe auth.users.banned_until) ---------
alter function public.admin_set_user_ban(uuid, boolean) security definer;
alter function public.admin_set_user_ban(uuid, boolean)
  set search_path = public, auth, pg_temp;

-- Nota: las demás funciones de 0011 (grupos, movimientos, auditoría, settings,
-- set_user_admin) sólo tocan `public` y quedan como SECURITY INVOKER: no
-- necesitan privilegios extra.

-- ───────────────────────────────────────────────────────────────────────────
-- ROLLBACK (vuelve a SECURITY INVOKER; el panel deja de ver usuarios):
--
--   alter function public.admin_dashboard(timestamptz,timestamptz,timestamptz,timestamptz) security invoker;
--   alter function public.admin_list_users(text,text,text,timestamptz,timestamptz,text,text,int,int) security invoker;
--   alter function public.admin_get_user(uuid) security invoker;
--   alter function public.admin_set_user_ban(uuid,boolean) security invoker;
