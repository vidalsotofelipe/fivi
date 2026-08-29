-- fivi — sincronización y políticas de acceso (etapa 3).
--
-- Decisiones:
--
-- 1. NO hay trigger que reescriba `updated_at`. La resolución de conflictos es
--    last-write-wins por `updated_at` con el reloj del CLIENTE que escribió
--    último (ver src/sync/applyRemoteChanges.ts). Si el servidor pisara
--    `updated_at` en cada upsert, esa comparación dejaría de tener sentido.
--
-- 2. Realtime: hay que habilitarlo para las tablas con `group_id`
--    (groups, participants, expenses, payments). `expense_participants` se
--    reconcilia por pull, no por Realtime.
--
-- 3. RLS: para el MVP no hay cuentas (sección 31). El acceso a un grupo se
--    comparte por enlace con un id no adivinable (UUID v4). Se habilita RLS y
--    se permite a `anon` leer/insertar/actualizar. NO se permite DELETE físico
--    (todo es soft delete vía `deleted_at`). Endurecer con auth/roles es
--    trabajo de una etapa posterior.

-- 1. Realtime -------------------------------------------------------------------
alter publication supabase_realtime add table public.groups;
alter publication supabase_realtime add table public.participants;
alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.payments;

-- 2. Row Level Security -------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'groups', 'participants', 'expenses', 'expense_participants', 'payments'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);

    execute format(
      'create policy %I on public.%I for select to anon using (true);',
      t || '_sel', t);

    execute format(
      'create policy %I on public.%I for insert to anon with check (true);',
      t || '_ins', t);

    execute format(
      'create policy %I on public.%I for update to anon using (true) with check (true);',
      t || '_upd', t);
  end loop;
end $$;

-- Nota: sin política de DELETE, `anon` no puede borrar filas físicamente.
-- La limpieza de tombstones antiguos se hace con un job de mantenimiento
-- (service_role), fuera del alcance del MVP.
