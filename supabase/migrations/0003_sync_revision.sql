-- fivi — cursor de sincronización server-owned (etapa de hardening, fase 3).
--
-- PROBLEMA
-- Hasta ahora el pull incremental usaba `updated_at > since`, donde `updated_at`
-- lo escribe el reloj del CLIENTE y `since` también se generaba en el cliente.
-- Con relojes desincronizados entre dispositivos:
--   * un dispositivo atrasado escribe `updated_at` en el pasado -> otro
--     dispositivo con `since` mayor NUNCA ve esa fila (cambio perdido);
--   * un dispositivo adelantado escribe `updated_at` en el futuro -> la fila se
--     vuelve a traer en cada pull (trabajo de más).
--
-- SOLUCIÓN
-- Una columna `sync_revision bigint` en cada tabla sincronizable, asignada
-- EXCLUSIVAMENTE por Postgres mediante una secuencia global y un trigger
-- BEFORE INSERT OR UPDATE. El cliente no puede fijarla ni modificarla (el
-- trigger sobrescribe cualquier valor entrante). El pull incremental usa
-- `sync_revision > cursor ORDER BY sync_revision`, y el cursor es el máximo
-- `sync_revision` recibido. Es monotónico y no depende de ningún reloj.
--
-- NOTA sobre resolución de conflictos: NO cambia. `applyRemoteChanges` sigue
-- resolviendo con last-write-wins por `updated_at` (+ `version`). `sync_revision`
-- es sólo el cursor de "qué falta traer", ortogonal a "quién gana".
--
-- LIMITACIÓN CONOCIDA (documentada): una secuencia puede dejar "huecos" si dos
-- transacciones se solapan (T1 toma nextval=100, T2 toma 101 y commitea antes
-- que T1; un lector que vio 101 podría no volver a pedir < 101). En fivi todas
-- las escrituras son upserts de una sola fila en autocommit vía PostgREST, así
-- que esa ventana es de microsegundos y, además, el motor hace un pull completo
-- (cursor = null) al arrancar, al volver la conexión y al volver a foreground.
-- Endurecerlo del todo (cursor basado en pg_snapshot_xmin) queda para más
-- adelante.
--
-- Idempotente.

create sequence if not exists public.sync_revision_seq;

do $$
declare
  t text;
begin
  foreach t in array array[
    'groups', 'participants', 'expenses', 'expense_participants', 'payments'
  ]
  loop
    -- 1. columna (nullable de entrada para poder rellenar)
    execute format(
      'alter table public.%I add column if not exists sync_revision bigint;', t);

    -- 2. relleno de filas existentes ANTES de crear el trigger
    execute format(
      'update public.%I set sync_revision = nextval(''public.sync_revision_seq'')
       where sync_revision is null;', t);

    -- 3. NOT NULL una vez que no quedan nulos
    execute format(
      'alter table public.%I alter column sync_revision set not null;', t);

    -- 4. índice para el pull incremental
    execute format(
      'create index if not exists %I on public.%I (sync_revision);',
      t || '_sync_revision_idx', t);
  end loop;
end $$;

-- 5. trigger que asigna sync_revision en TODA escritura, ignorando al cliente.
--    SECURITY DEFINER: corre con los privilegios del dueño (para `nextval` sobre
--    la secuencia) sin tener que darle acceso directo a la secuencia al rol
--    `anon`. `search_path` fijado por seguridad; la secuencia va calificada.
create or replace function public.set_sync_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.sync_revision := nextval('public.sync_revision_seq');
  return new;
end;
$$;
revoke all on function public.set_sync_revision() from public;

do $$
declare
  t text;
begin
  foreach t in array array[
    'groups', 'participants', 'expenses', 'expense_participants', 'payments'
  ]
  loop
    execute format(
      'drop trigger if exists set_sync_revision on public.%I;', t);
    execute format(
      'create trigger set_sync_revision
         before insert or update on public.%I
         for each row execute function public.set_sync_revision();', t);
  end loop;
end $$;
