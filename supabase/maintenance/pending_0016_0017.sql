-- FIVI v0.16.5 — migraciones pendientes de aplicar en producción.
--
-- Las dos son ADITIVAS e IDEMPOTENTES: no borran ni reescriben nada, y se
-- pueden correr más de una vez sin efecto. La app ya está desplegada y funciona
-- sin ellas; esto completa el trabajo.
--
-- Correr en el SQL Editor del proyecto (niridmjosgyocixengwc).

-- ===========================================================================
-- 0016 — Límites de longitud del lado del servidor
--
-- Hasta ahora el largo de los textos sólo se controlaba en el cliente. Los
-- mismos números viven en `src/domain/limits.ts`.
--
-- `not valid` hace que la restricción rija para lo nuevo sin fallar por filas
-- viejas que se pasen. Como la base se vació hace poco, no hay ninguna: al final
-- del archivo se validan, así que también rige para lo existente.
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'groups_name_len') then
    alter table public.groups
      add constraint groups_name_len check (char_length(name) <= 60) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'groups_description_len') then
    alter table public.groups
      add constraint groups_description_len
      check (description is null or char_length(description) <= 120) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'expenses_description_len') then
    alter table public.expenses
      add constraint expenses_description_len
      check (char_length(description) <= 120) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'participants_name_len') then
    alter table public.participants
      add constraint participants_name_len
      check (char_length(name) <= 60) not valid;
  end if;
end $$;

-- ===========================================================================
-- 0017 — Fuente por moneda en el cache de cotizaciones
--
-- La tabla guardaba un único `provider` para todas las monedas. Con la
-- cotización oficial del BNA para ARS hace falta poder decir de dónde salió
-- cada una: { "ARS": { "provider": "...", "official": true, "quoted_at": "..." } }
--
-- Sin esta columna la app funciona igual (atribuye todo al proveedor base), pero
-- el cache compartido de cotizaciones no guarda las fuentes.
-- ===========================================================================

alter table public.exchange_rates
  add column if not exists sources jsonb not null default '{}'::jsonb;

-- ===========================================================================
-- Validar los checks contra los datos existentes. Si alguno fallara, hay filas
-- que se pasan del límite: revisarlas antes de insistir (no se pierde nada, la
-- restricción simplemente queda `not valid` y sigue rigiendo para lo nuevo).
-- ===========================================================================

alter table public.groups       validate constraint groups_name_len;
alter table public.groups       validate constraint groups_description_len;
alter table public.expenses     validate constraint expenses_description_len;
alter table public.participants validate constraint participants_name_len;

-- ===========================================================================
-- Comprobación final.
-- ===========================================================================

select conname, convalidated
  from pg_constraint
 where conname in (
   'groups_name_len', 'groups_description_len',
   'expenses_description_len', 'participants_name_len'
 )
 order by conname;

select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'exchange_rates'
   and column_name = 'sources';
