-- Fuente POR MONEDA en el cache de cotizaciones.
--
-- Hasta ahora la tabla guardaba un único `provider` para todas las monedas. Con
-- la incorporación de fuentes oficiales por moneda (la primera: ARS con la
-- cotización del Banco de la Nación Argentina), hace falta poder decir de dónde
-- salió cada una: nombre de la fuente, si es oficial y de qué fecha.
--
-- Forma: { "ARS": { "provider": "...", "official": true, "quoted_at": "2026-09-03" } }
--
-- Aditiva, idempotente y opcional: sin la columna, o con ella en null, todas las
-- monedas se atribuyen al proveedor base, que es el comportamiento anterior.

alter table public.exchange_rates
  add column if not exists sources jsonb not null default '{}'::jsonb;
