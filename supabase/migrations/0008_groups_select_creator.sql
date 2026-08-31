-- fivi — el creador de un grupo puede leerlo aunque su fila de membresía todavía
-- no exista (Etapa 7, fix 0.7.1).
--
-- PROBLEMA
-- Al crear un grupo, el owner queda en `group_members` mediante un trigger
-- AFTER INSERT (`groups_add_owner`). Pero si el INSERT usa `RETURNING` (o el
-- cliente pide `Prefer: return=representation`), PostgreSQL re-chequea la fila
-- recién insertada contra la policy de SELECT de `groups` ANTES de que el
-- trigger AFTER haya corrido -> `is_group_member(id)` da falso -> el INSERT
-- falla con "new row violates row-level security policy for table groups".
--
-- El push de fivi (`supabaseRemote.push`) hace `upsert` sin `.select()`, o sea
-- `return=minimal` (sin RETURNING), así que no se ve afectado. Pero cualquier
-- cliente que use `return=representation` sí, y el modelo no debería depender de
-- ese detalle.
--
-- SOLUCIÓN
-- Ampliar `groups_select` para que el creador (`created_by`, que fija y congela
-- un trigger BEFORE, no lo puede falsear el cliente) siempre pueda leer su
-- grupo. No debilita el acceso: un tercero sigue necesitando membresía
-- (`created_by` es del creador, no de quien conoce el UUID).
--
-- NO modifica migraciones anteriores. Idempotente.

drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select to authenticated
  using (
    public.is_group_member(id)
    or created_by = (select auth.uid())
  );
