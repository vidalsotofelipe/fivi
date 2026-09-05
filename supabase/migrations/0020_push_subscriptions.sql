-- fivi — notificaciones push por deuda pendiente (por grupo y persona).
--
-- Guarda la suscripción Web Push de un dispositivo para un grupo puntual:
-- qué endpoint/claves usar, a qué participante ("quién soy en este grupo")
-- corresponde avisarle, y el último saldo por el que ya se avisó (para no
-- repetir el aviso en cada sync si la deuda no cambió).
--
-- Por qué NO es una tabla más del motor de sync (a diferencia de groups/
-- participants/expenses/payments):
--   * Una suscripción push sólo tiene sentido con el dispositivo online (no
--     hay "modo offline" para esto) — no aporta nada meterla en la cola de
--     sync_queue ni en el pull de otros dispositivos.
--   * Nadie más que el propio dispositivo necesita LEER su fila; quien sí
--     necesita leer TODAS las filas de un grupo (para mandar el push a cada
--     suscripto) es el propio backend (rol service_role), no otro cliente.
--   * Por eso se resuelve con dos rutas de servidor dedicadas
--     (/api/notifications/subscribe y /api/notifications/send-debt), cada
--     una verificando el JWT del dispositivo a mano y usando el cliente de
--     service_role — igual que /api/feedback. El cliente NUNCA le pega
--     directo a esta tabla vía PostgREST.
--
-- RLS: default-deny (mismo patrón que `feedback` en 0018 y `admin_audit_log`
-- en 0010) — no hacen falta políticas porque nadie entra por RLS, sólo por
-- service_role desde las rutas de servidor.
--
-- Aditiva. NO modifica 0001..0019.

create table if not exists public.push_subscriptions (
  -- `gen_random_uuid()` es nativo desde Postgres 13 (sin pgcrypto): a
  -- diferencia del resto de la app (ids generados por el cliente), acá el
  -- servidor genera el id porque el upsert por (user_id, group_id) nunca
  -- manda `id` — así una re-suscripción actualiza la fila existente sin
  -- rotar su clave primaria en cada `ON CONFLICT DO UPDATE`.
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  group_id uuid not null references public.groups (id),
  participant_id uuid not null references public.participants (id),
  endpoint text not null check (char_length(endpoint) between 1 and 2000),
  p256dh text not null check (char_length(p256dh) between 1 and 500),
  auth_key text not null check (char_length(auth_key) between 1 and 500),
  enabled boolean not null default true,
  last_notified_balance_minor bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, group_id)
);

create index if not exists push_subscriptions_group_id_idx
  on public.push_subscriptions (group_id);
create index if not exists push_subscriptions_enabled_idx
  on public.push_subscriptions (enabled);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

comment on table public.push_subscriptions is
  'Suscripción Web Push de un dispositivo para un grupo. Sólo la tocan las rutas de servidor (service_role); default-deny para anon/authenticated.';

-- ROLLBACK (manual, sólo si hiciera falta revertir):
--   drop table if exists public.push_subscriptions;
