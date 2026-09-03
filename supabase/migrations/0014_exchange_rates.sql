-- fivi — cache de cotizaciones para la "moneda principal" del usuario.
--
-- FIVI no convierte divisas dentro de un grupo: cada gasto/grupo mantiene su
-- moneda original. Esta tabla es SÓLO para el balance global estimado del
-- inicio: guarda la última tabla de cotizaciones traída de un proveedor
-- externo, para
--   * servir un cache "tibio" aunque la función arranque en frío (serverless),
--   * compartirlo entre todos los usuarios (una sola llamada al proveedor),
--   * sobrevivir a una caída temporal del proveedor (fallback a la última
--     válida, mostrando su fecha),
--   * dejar la puerta abierta a cotizaciones históricas más adelante.
--
-- La escribe y la lee SÓLO el backend con el cliente service-role
-- (`/api/rates`). RLS activada sin policies: nadie más la toca.
--
-- Aditiva, idempotente. NO modifica 0001..0013.

create table if not exists public.exchange_rates (
  base        text        primary key,            -- moneda base (p. ej. 'USD')
  rates       jsonb       not null,               -- { "ARS": 1450.2, "EUR": 0.92, ... }  unidades de X por 1 base
  provider    text        not null,               -- fuente de la cotización
  quoted_at   timestamptz not null,               -- cuándo la calculó el proveedor
  fetched_at  timestamptz not null default now(), -- cuándo la trajo FIVI
  updated_at  timestamptz not null default now()
);

comment on table public.exchange_rates is
  'Cache de cotizaciones para el balance global (moneda principal). No afecta la moneda de grupos ni gastos. Sólo backend/service-role.';

alter table public.exchange_rates enable row level security;
-- Sin policies: sólo `service_role` (que bypassa RLS) lee/escribe.
revoke all on table public.exchange_rates from anon, authenticated;

-- ROLLBACK:
--   drop table if exists public.exchange_rates;
