-- fivi — invitaciones a grupos (Etapa 7).
--
-- El UUID de un grupo dejó de ser autorización (ver 0007). Para sumar a alguien
-- se genera un enlace `/join/<token>`:
--   * el token es una cadena aleatoria de 256 bits (base64url) que vive sólo en
--     el enlace; el servidor guarda únicamente su hash SHA-256 (`token_hash`);
--   * se puede revocar (`revoked_at`) y, opcionalmente, expira (`expires_at`) o
--     limita la cantidad de usos (`max_uses`);
--   * se canjea con la RPC `redeem_group_invite`, que valida en el servidor
--     (no se confía en el cliente) y agrega al usuario a `group_members`.
--
-- Cualquier miembro del grupo puede crear una invitación; revoca el owner o
-- quien la creó (ver policies).
--
-- No usa pgcrypto: `sha256(bytea)` y `gen_random_uuid()` son del core de
-- Postgres (>= 14). Idempotente. NO modifica 0001..0005.

-- 1. Tabla -------------------------------------------------------------------
create table if not exists public.group_invites (
  id         uuid        primary key default gen_random_uuid(),
  group_id   uuid        not null references public.groups (id) on delete cascade,
  token_hash bytea       not null unique,
  created_by uuid        not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  max_uses   integer,
  uses       integer     not null default 0
);
create index if not exists group_invites_group_id_idx
  on public.group_invites (group_id);

-- 2. created_by := usuario actual en el INSERT ------------------------------
create or replace function public.group_invites_set_created_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by := coalesce((select auth.uid()), new.created_by);
  return new;
end;
$$;
revoke all on function public.group_invites_set_created_by() from public;

drop trigger if exists group_invites_set_created_by on public.group_invites;
create trigger group_invites_set_created_by
  before insert on public.group_invites
  for each row execute function public.group_invites_set_created_by();

-- 3. Canje: valida y agrega a group_members -------------------------------------
--    SECURITY DEFINER para poder insertar en group_members saltando la policy de
--    alta (que exige owner). Devuelve el group_id para que el cliente abra el
--    grupo. Errores con SQLSTATE distinguible para que el frontend muestre el
--    mensaje adecuado.
create or replace function public.redeem_group_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_hash   bytea := sha256(convert_to(p_token, 'UTF8'));
  v_invite public.group_invites%rowtype;
  v_rows   integer;
begin
  if v_uid is null then
    raise exception 'Necesitás una sesión para aceptar una invitación'
      using errcode = '28000';
  end if;

  select * into v_invite
  from public.group_invites
  where token_hash = v_hash;

  if not found then
    raise exception 'Invitación no encontrada' using errcode = 'P0002';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'Esta invitación fue revocada' using errcode = 'P0001';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'Esta invitación expiró' using errcode = 'P0001';
  end if;
  if v_invite.max_uses is not null and v_invite.uses >= v_invite.max_uses then
    raise exception 'Esta invitación alcanzó su límite de usos' using errcode = 'P0001';
  end if;

  -- Idempotente: canjear dos veces el mismo usuario no duplica ni suma `uses`.
  insert into public.group_members (group_id, user_id, role)
  values (v_invite.group_id, v_uid, 'member')
  on conflict (group_id, user_id) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    update public.group_invites set uses = uses + 1 where id = v_invite.id;
  end if;

  return v_invite.group_id;
end;
$$;
revoke all on function public.redeem_group_invite(text) from public;
grant execute on function public.redeem_group_invite(text) to authenticated;

-- 4. RLS de group_invites --------------------------------------------------------
alter table public.group_invites enable row level security;

-- Ver invitaciones del grupo: cualquier miembro (para gestionarlas). El
-- `token_hash` no sirve para canjear (es un hash), pero igual queda acotado.
drop policy if exists group_invites_select on public.group_invites;
create policy group_invites_select on public.group_invites
  for select to authenticated
  using (public.is_group_member(group_id));

-- Crear: cualquier miembro del grupo (el trigger fuerza created_by = auth.uid()).
drop policy if exists group_invites_insert on public.group_invites;
create policy group_invites_insert on public.group_invites
  for insert to authenticated
  with check (
    public.is_group_member(group_id)
    and created_by = (select auth.uid())
  );

-- Revocar (update de revoked_at): el owner o quien creó la invitación.
drop policy if exists group_invites_update on public.group_invites;
create policy group_invites_update on public.group_invites
  for update to authenticated
  using (
    public.is_group_owner(group_id)
    or created_by = (select auth.uid())
  )
  with check (
    public.is_group_owner(group_id)
    or created_by = (select auth.uid())
  );

grant select, insert, update on public.group_invites to authenticated;
revoke all on public.group_invites from anon;
