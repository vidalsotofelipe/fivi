/**
 * Cliente HTTP del panel: agrega el Bearer token de la sesión admin y normaliza
 * errores. La autorización real la hace el backend en cada endpoint; esto es
 * sólo el transporte.
 */
import { getAdminSupabase } from "./adminSupabase";

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const client = await getAdminSupabase();
  const token = client ? (await client.auth.getSession()).data.session?.access_token : null;
  return token ? { authorization: `Bearer ${token}` } : {};
}

export async function adminFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(await authHeader()),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const message =
      (isJson && body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : null) ?? `Error ${res.status}`;
    throw new AdminApiError(res.status, message);
  }
  return body as T;
}

/** Igual que `adminFetch` pero devuelve la `Response` cruda (para descargas CSV). */
export async function adminFetchRaw(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(path, {
    ...init,
    headers: { ...(await authHeader()), ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) message = String(j.error);
    } catch {
      /* respuesta sin JSON */
    }
    throw new AdminApiError(res.status, message);
  }
  return res;
}
