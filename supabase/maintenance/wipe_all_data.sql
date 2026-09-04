-- ============================================================================
-- FIVI — borrado total de datos (etapa de prueba)
--
-- NO es una migración: no toca el esquema, sólo vacía las tablas.
-- Correr en el SQL Editor del proyecto (niridmjosgyocixengwc).
--
-- DESTRUCTIVO E IRREVERSIBLE. No hay backup automático de esto.
-- ============================================================================

-- Antes: ver qué hay.
select 'groups' as tabla, count(*) from public.groups
union all select 'participants',        count(*) from public.participants
union all select 'expenses',            count(*) from public.expenses
union all select 'expense_participants',count(*) from public.expense_participants
union all select 'payments',            count(*) from public.payments
union all select 'group_members',       count(*) from public.group_members
union all select 'group_invites',       count(*) from public.group_invites
union all select 'group_archives',      count(*) from public.group_archives
union all select 'exchange_rates',      count(*) from public.exchange_rates
union all select 'admin_audit_log',     count(*) from public.admin_audit_log
order by 1;

-- ----------------------------------------------------------------------------
-- Borrado. Todo en una transacción: o entra completo o no entra nada.
-- El orden respeta las claves foráneas (hijos antes que padres).
-- ----------------------------------------------------------------------------
begin;

delete from public.expense_participants;
delete from public.expenses;
delete from public.payments;
delete from public.participants;
delete from public.group_invites;
delete from public.group_members;
delete from public.group_archives;
delete from public.groups;

-- Cache de cotizaciones: se repuebla sola en la próxima consulta.
delete from public.exchange_rates;

-- Auditoría del panel admin.
delete from public.admin_audit_log;

commit;

-- ----------------------------------------------------------------------------
-- NO se tocan (config, no datos de prueba):
--   public.admin_settings  — configuración del panel (zona horaria, flags)
--   public.app_admins      — quién es admin
--   auth.users             — usuarios anónimos del Anonymous Sign-In
--
-- Si además querés borrar los usuarios anónimos huérfanos, corré esto aparte.
-- Cada dispositivo va a crear uno nuevo la próxima vez que entre.
-- ----------------------------------------------------------------------------
-- delete from auth.users;

-- Después: confirmar que quedó en cero.
select 'groups' as tabla, count(*) from public.groups
union all select 'participants',        count(*) from public.participants
union all select 'expenses',            count(*) from public.expenses
union all select 'expense_participants',count(*) from public.expense_participants
union all select 'payments',            count(*) from public.payments
union all select 'group_members',       count(*) from public.group_members
union all select 'group_invites',       count(*) from public.group_invites
union all select 'group_archives',      count(*) from public.group_archives
order by 1;
