-- fivi — esquema inicial del servidor (sección 24 del documento).
--
-- Espejo del modelo local. Cada tabla sincronizable incluye:
--   id (uuid, PK, generado en el cliente)
--   created_at / updated_at (timestamptz)
--   version (int) — detector de conflictos
--   deleted_at (timestamptz null) — soft delete / tombstone
--
-- Dinero: siempre entero en unidad mínima (amount_minor_units / share_minor_units).
-- Un grupo trabaja con una única moneda (currency_code, ISO 4217).
--
-- NOTA: en esta etapa el archivo queda listo pero NO se aplica. La app funciona
-- 100% local contra IndexedDB. RLS/policies se definirán junto con la
-- implementación real de sincronización.

create extension if not exists "pgcrypto";

-- grupos ----------------------------------------------------------------------
create table if not exists public.groups (
  id            uuid primary key,
  name          text        not null check (length(btrim(name)) > 0),
  description   text,
  currency_code text        not null check (currency_code ~ '^[A-Z]{3}$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  version       integer     not null default 1,
  deleted_at    timestamptz
);

-- participantes --------------------------------------------------------------
create table if not exists public.participants (
  id         uuid primary key,
  group_id   uuid        not null references public.groups (id),
  name       text        not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer     not null default 1,
  deleted_at timestamptz
);
create index if not exists participants_group_id_idx on public.participants (group_id);
create index if not exists participants_updated_at_idx on public.participants (updated_at);

-- gastos ---------------------------------------------------------------------
create table if not exists public.expenses (
  id                 uuid        primary key,
  group_id           uuid        not null references public.groups (id),
  description        text        not null check (length(btrim(description)) > 0),
  amount_minor_units bigint      not null check (amount_minor_units > 0),
  paid_by            uuid        not null references public.participants (id),
  expense_date       date        not null,
  split_strategy     jsonb       not null default '{"kind":"equal"}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  version            integer     not null default 1,
  deleted_at         timestamptz
);
create index if not exists expenses_group_id_idx on public.expenses (group_id);
create index if not exists expenses_updated_at_idx on public.expenses (updated_at);

-- reparto de cada gasto --------------------------------------------------------
create table if not exists public.expense_participants (
  id                 uuid        primary key,
  expense_id         uuid        not null references public.expenses (id),
  participant_id     uuid        not null references public.participants (id),
  share_minor_units  bigint      not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  version            integer     not null default 1,
  deleted_at         timestamptz,
  unique (expense_id, participant_id)
);
create index if not exists expense_participants_expense_id_idx on public.expense_participants (expense_id);
create index if not exists expense_participants_updated_at_idx on public.expense_participants (updated_at);

-- pagos entre participantes --------------------------------------------------
create table if not exists public.payments (
  id                 uuid        primary key,
  group_id           uuid        not null references public.groups (id),
  from_participant   uuid        not null references public.participants (id),
  to_participant     uuid        not null references public.participants (id),
  amount_minor_units bigint      not null check (amount_minor_units > 0),
  payment_date       date        not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  version            integer     not null default 1,
  deleted_at         timestamptz,
  check (from_participant <> to_participant)
);
create index if not exists payments_group_id_idx on public.payments (group_id);
create index if not exists payments_updated_at_idx on public.payments (updated_at);
