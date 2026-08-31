"use client";

import { useEffect, useState } from "react";

/**
 * `false` en el SSR y en el primer render del cliente; `true` tras montar.
 *
 * FIVI lee sus datos de IndexedDB, que no existe en el servidor: el HTML del
 * SSR es descartable. Las pantallas usan este flag para mostrar el skeleton de
 * carga hasta estar montadas y evitar mismatches de hidratación cuando
 * `useLiveQuery` resuelve de forma sincrónica en el cliente.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
