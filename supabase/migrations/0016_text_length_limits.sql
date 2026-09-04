-- Límites de longitud del lado del servidor.
--
-- Hasta ahora el largo de los textos sólo se controlaba en el cliente: un
-- cliente viejo, manipulado o con un bug podía subir un nombre de grupo o una
-- descripción de cualquier tamaño. Los mismos números viven en
-- `src/domain/limits.ts`; si cambian, cambian en los dos lados.
--
-- Es aditiva y idempotente. `not valid` evita que falle si alguna fila vieja se
-- pasa del límite: la restricción rige para lo nuevo y se puede validar después
-- con `alter table ... validate constraint ...` cuando los datos estén limpios.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'groups_name_len'
  ) then
    alter table public.groups
      add constraint groups_name_len check (char_length(name) <= 60) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'groups_description_len'
  ) then
    alter table public.groups
      add constraint groups_description_len
      check (description is null or char_length(description) <= 120) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'expenses_description_len'
  ) then
    alter table public.expenses
      add constraint expenses_description_len
      check (char_length(description) <= 120) not valid;
  end if;

  -- `payments` no tiene columna `note` en el servidor (la nota del pago vive
  -- sólo en el cliente), así que acá no hay nada que limitar.

  if not exists (
    select 1 from pg_constraint where conname = 'participants_name_len'
  ) then
    alter table public.participants
      add constraint participants_name_len
      check (char_length(name) <= 60) not valid;
  end if;
end $$;
