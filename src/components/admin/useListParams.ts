"use client";

import { useMemo, useState } from "react";

export interface ListParams {
  search: string;
  sort: string;
  dir: "asc" | "desc";
  offset: number;
  limit: number;
  filters: Record<string, string>;
}

export interface ListParamsApi extends ListParams {
  query: string;
  setSearch: (v: string) => void;
  setSort: (col: string) => void;
  setFilter: (key: string, value: string) => void;
  setOffset: (n: number) => void;
  reset: () => void;
}

/**
 * Estado de una tabla del panel (búsqueda / orden / filtros / paginación) y el
 * querystring derivado para pasarle a `useApi`. Cambiar cualquier filtro vuelve
 * a la primera página.
 */
export function useListParams(init: Partial<ListParams> = {}): ListParamsApi {
  const base: ListParams = {
    search: "",
    sort: init.sort ?? "created_at",
    dir: init.dir ?? "desc",
    offset: 0,
    limit: init.limit ?? 25,
    filters: init.filters ?? {},
  };
  const [state, setState] = useState<ListParams>(base);

  const api = useMemo<ListParamsApi>(() => {
    const params = new URLSearchParams();
    if (state.search) params.set("search", state.search);
    params.set("sort", state.sort);
    params.set("dir", state.dir);
    params.set("limit", String(state.limit));
    params.set("offset", String(state.offset));
    for (const [k, v] of Object.entries(state.filters)) {
      if (v) params.set(k, v);
    }
    return {
      ...state,
      query: params.toString(),
      setSearch: (v) => setState((s) => ({ ...s, search: v, offset: 0 })),
      setSort: (col) =>
        setState((s) => ({
          ...s,
          offset: 0,
          sort: col,
          dir: s.sort === col && s.dir === "desc" ? "asc" : "desc",
        })),
      setFilter: (key, value) =>
        setState((s) => ({ ...s, offset: 0, filters: { ...s.filters, [key]: value } })),
      setOffset: (n) => setState((s) => ({ ...s, offset: Math.max(0, n) })),
      reset: () => setState(base),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return api;
}
