"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch, AdminApiError } from "@/lib/adminFetch";

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  status: number | null;
  loading: boolean;
  reload: () => void;
}

/**
 * GET a un endpoint del panel con estados de carga/error y `reload()`. Sin
 * dependencias (no react-query). `path` puede cambiar (filtros, paginación).
 */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    adminFetch<T>(path)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setStatus(200);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setStatus(e instanceof AdminApiError ? e.status : null);
        setError(e instanceof Error ? e.message : "Error inesperado");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, nonce]);

  return { data, error, status, loading, reload };
}
