-- fivi — sincronización y políticas de acceso (etapa 3).
--
-- Decisiones:
--
-- 1. NO hay trigger que reescriba `updated_at`. La resolución de conflictos es
--    last-write-wins por `updated_at` con el reloj del CLIENTE que escribió
--    último (ver src/sync/applyRemoteChanges.ts). Si el servidor pisara
--    `updated_at` en cada upsert, esa comparación dejaría de tener sentido.
--
-- 2. Realtime: se habilita para las tablas con `group_id`
--    (groups, participants, expenses, payments). `expense_participants` se
--    reconcilia por pull, no por Realtime.
--
-- 3. RLS: para el MVP no hay cuentas (sección 31). El acceso a un grupo se
--    comparte por enlace con un id no adivinable (UUID v4). Se habilita RLS y
--    se permite a `anon` leer/insertar/actualizar. NO se permite DELETE físico
--    (todo es soft delete vía `deleted_at`). Endurecer con auth/roles es
--    trabajo de una etapa posterior.
--
-- Idempotente: se puede correr más de una vez sin error.

-- 1. Realtime ---------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['groups', 'participants', 'expenses', 'payments']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;

-- 2. Row Level Security ---------------------------------------------------------
do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'groups', 'participants', 'expenses', 'expense_participants', 'payments'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);

    for p in
      select * from (values
        ('_sel', 'for select to anon using (true)'),
        ('_ins', 'for insert to anon with check (true)'),
        ('_upd', 'for update to anon using (true) with check (true)')
      ) as x(suffix, clause)
    loop
      if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = t
          and policyname = t || p.suffix
      ) then
        execute format(
          'create policy %I on public.%I %s;', t || p.suffix, t, p.clause);
      end if;
    end loop;
  end loop;
end $$;

-- Nota: sin política de DELETE, `anon` no puede borrar filas físicamente.
-- La limpieza de tombstones antiguos se hace con un job de mantenimiento
-- (service_role), fuera del alcance del MVP.
