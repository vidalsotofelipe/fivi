"use client";

/**
 * Cotizaciones para el balance global, del lado del cliente.
 *
 * - Cachea la última tabla válida en IndexedDB (`settings/fx_table`), así el
 *   dashboard funciona sin conexión y no se pega a `/api/rates` en cada render.
 * - Refresca en segundo plano si el cache tiene más de `FX_CLIENT_TTL_MS`, o si
 *   no hay cache. Nunca bloquea: devuelve lo cacheado al instante.
 * - Si el refresco falla, se conserva la tabla vieja marcada `stale` (nunca se
 *   ocultan los importes originales por un problema del proveedor).
 */
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { setSetting } from "@/data/settings";
import type { RateTable } from "@/domain/convert";

const FX_TABLE_KEY = "fx_table";
const FX_CLIENT_TTL_MS = 6 * 60 * 60 * 1000;

// Una sola corrida de refresco por sesión (salvo que el cache esté vencido).
let refreshedAt = 0;

export interface ExchangeState {
  table: RateTable | null;
  /** La cotización mostrada puede estar desactualizada. */
  stale: boolean;
  loading: boolean;
}

function isExpired(t: RateTable | null | undefined): boolean {
  if (!t) return true;
  return Date.now() - new Date(t.fetched_at).getTime() > FX_CLIENT_TTL_MS;
}

export function useExchangeTable(enabled: boolean): ExchangeState {
  // `undefined` = todavía leyendo IndexedDB · `null` = no hay cache · valor = cache.
  const cached = useLiveQuery(async () => {
    const row = await db.settings.get(FX_TABLE_KEY);
    return (row?.value as RateTable | undefined) ?? null;
  }, []);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (cached === undefined) return; // todavía leyendo IndexedDB
    const expired = isExpired(cached);
    if (!expired && cached) {
      setStale(false);
      return;
    }
    if (Date.now() - refreshedAt < 60_000) return; // evita reintentos en bucle
    refreshedAt = Date.now();

    let cancelled = false;
    setLoading(true);
    fetch("/api/rates", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as RateTable & { stale?: boolean };
      })
      .then(async (body) => {
        if (cancelled) return;
        const next: RateTable = {
          base: body.base,
          rates: body.rates,
          provider: body.provider,
          // Un cache viejo (o un servidor anterior) no trae el campo: sin dato,
          // se asume NO oficial. Nunca al revés.
          official: body.official === true,
          quoted_at: body.quoted_at,
          fetched_at: body.fetched_at ?? new Date().toISOString(),
        };
        await setSetting(FX_TABLE_KEY, next);
        setStale(Boolean(body.stale));
      })
      .catch(() => {
        if (!cancelled) setStale(Boolean(cached)); // hay cache viejo → stale
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, cached]);

  return {
    table: cached ?? null,
    stale: stale || (enabled ? isExpired(cached) && !!cached : false),
    loading,
  };
}
