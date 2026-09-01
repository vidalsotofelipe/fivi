/**
 * Tests de los Route Handlers de `/api/admin/*`: autorización (401/403),
 * validación de parámetros y que los filtros/paginación llegan a la función SQL
 * correcta. El cliente service-role está mockeado; no toca Postgres.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const maybeSingle = vi.fn();
const rpc = vi.fn();
const insert = vi.fn(() => Promise.resolve({ error: null }));

vi.mock("@/lib/supabaseAdmin", () => ({
  adminConfigured: () => true,
  getAdminClient: () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
      insert,
    }),
    rpc,
  }),
}));

const UID = "11111111-1111-1111-1111-111111111111";

function asAdmin() {
  getUser.mockResolvedValue({ data: { user: { id: UID, email: "a@fivi.app" } }, error: null });
  maybeSingle.mockResolvedValue({ data: { user_id: UID }, error: null });
}

beforeEach(() => {
  getUser.mockReset();
  maybeSingle.mockReset();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { total: 0, rows: [] }, error: null });
  insert.mockClear();
});

const req = (url: string, init: RequestInit = {}) =>
  new Request(`http://localhost${url}`, init);
const authed = (url: string, init: RequestInit = {}) =>
  req(url, { ...init, headers: { authorization: "Bearer tok", ...(init.headers ?? {}) } });

/** 2º arg que Next pasa a los Route Handlers (App Router, Next 15). */
const NO_CTX = { params: Promise.resolve({} as Record<string, string>) };
const ctxOf = (id: string) => ({ params: Promise.resolve({ id }) });

describe("autorización", () => {
  it("401 sin token", async () => {
    const { GET } = await import("@/app/api/admin/metrics/route");
    const res = await GET(req("/api/admin/metrics"), NO_CTX);
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("403 usuario autenticado que no es admin", async () => {
    getUser.mockResolvedValue({ data: { user: { id: UID, email: null } }, error: null });
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { GET } = await import("@/app/api/admin/users/route");
    const res = await GET(authed("/api/admin/users"), NO_CTX);
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("metrics", () => {
  it("pasa un rango de 4 timestamps ISO a admin_dashboard", async () => {
    asAdmin();
    rpc.mockResolvedValue({ data: { users: { total: 1 } }, error: null });
    const { GET } = await import("@/app/api/admin/metrics/route");
    const res = await GET(authed("/api/admin/metrics?period=7"), NO_CTX);
    expect(res.status).toBe(200);
    const [fn, args] = rpc.mock.calls[0]!;
    expect(fn).toBe("admin_dashboard");
    for (const k of ["p_from", "p_to", "p_prev_from", "p_prev_to"]) {
      expect(Number.isNaN(Date.parse((args as Record<string, string>)[k]!))).toBe(false);
    }
    const body = await res.json();
    expect(body.range).toBeDefined();
  });
});

describe("users list", () => {
  it("traslada search/sort/dir/limit/page a admin_list_users", async () => {
    asAdmin();
    const { GET } = await import("@/app/api/admin/users/route");
    await GET(authed("/api/admin/users?search=ana&sort=email&dir=asc&limit=10&page=3"), NO_CTX);
    const [fn, args] = rpc.mock.calls[0]!;
    expect(fn).toBe("admin_list_users");
    expect(args).toMatchObject({
      p_search: "ana",
      p_sort: "email",
      p_dir: "asc",
      p_limit: 10,
      p_offset: 20,
    });
  });

  it("un sort no permitido cae al fallback created_at", async () => {
    asAdmin();
    const { GET } = await import("@/app/api/admin/users/route");
    await GET(authed("/api/admin/users?sort=banned_until"), NO_CTX);
    expect(rpc.mock.calls[0]![1]).toMatchObject({ p_sort: "created_at" });
  });
});

describe("user detail", () => {
  it("400 si el id no es uuid", async () => {
    asAdmin();
    const { GET } = await import("@/app/api/admin/users/[id]/route");
    const res = await GET(authed("/api/admin/users/foo"), ctxOf("foo"));
    expect(res.status).toBe(400);
  });

  it("404 si la función devuelve null", async () => {
    asAdmin();
    rpc.mockResolvedValue({ data: null, error: null });
    const { GET } = await import("@/app/api/admin/users/[id]/route");
    const res = await GET(authed(`/api/admin/users/${UID}`), ctxOf(UID));
    expect(res.status).toBe(404);
  });
});

describe("toggle admin", () => {
  it("400 sin 'make' en el body", async () => {
    asAdmin();
    const { POST } = await import("@/app/api/admin/users/[id]/admin/route");
    const res = await POST(
      authed(`/api/admin/users/${UID}/admin`, { method: "POST", body: "{}" }),
      ctxOf(UID),
    );
    expect(res.status).toBe(400);
  });

  it("200 y audita cuando concede", async () => {
    asAdmin();
    rpc.mockResolvedValue({ data: { is_admin: true, admin_count: 2 }, error: null });
    const { POST } = await import("@/app/api/admin/users/[id]/admin/route");
    const res = await POST(
      authed(`/api/admin/users/${UID}/admin`, { method: "POST", body: JSON.stringify({ make: true }) }),
      ctxOf(UID),
    );
    expect(res.status).toBe(200);
    expect(rpc.mock.calls[0]![0]).toBe("admin_set_user_admin");
    expect(insert).toHaveBeenCalled(); // auditoría
  });

  it("409 cuando la función lanza P0001 (último admin)", async () => {
    asAdmin();
    rpc.mockResolvedValue({
      data: null,
      error: { message: "No se puede quitar el último administrador", code: "P0001" },
    });
    const { POST } = await import("@/app/api/admin/users/[id]/admin/route");
    const res = await POST(
      authed(`/api/admin/users/${UID}/admin`, { method: "POST", body: JSON.stringify({ make: false }) }),
      ctxOf(UID),
    );
    expect(res.status).toBe(409);
  });
});

describe("ban", () => {
  it("200 y audita user.deactivate", async () => {
    asAdmin();
    rpc.mockResolvedValue({ data: { banned_until: "infinity" }, error: null });
    const { POST } = await import("@/app/api/admin/users/[id]/ban/route");
    const res = await POST(
      authed(`/api/admin/users/${UID}/ban`, { method: "POST", body: JSON.stringify({ ban: true }) }),
      ctxOf(UID),
    );
    expect(res.status).toBe(200);
    expect(rpc.mock.calls[0]![0]).toBe("admin_set_user_ban");
    expect(insert).toHaveBeenCalled();
  });

  it("409 si se intenta desactivar a un admin (P0001)", async () => {
    asAdmin();
    rpc.mockResolvedValue({
      data: null,
      error: { message: "No se puede desactivar a un administrador", code: "P0001" },
    });
    const { POST } = await import("@/app/api/admin/users/[id]/ban/route");
    const res = await POST(
      authed(`/api/admin/users/${UID}/ban`, { method: "POST", body: JSON.stringify({ ban: true }) }),
      ctxOf(UID),
    );
    expect(res.status).toBe(409);
  });
});

describe("settings PATCH", () => {
  it("400 con moneda inválida", async () => {
    asAdmin();
    const { PATCH } = await import("@/app/api/admin/settings/route");
    const res = await PATCH(
      authed("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ key: "default_currency", value: "ars" }) }),
      NO_CTX,
    );
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("200 con moneda válida y audita", async () => {
    asAdmin();
    rpc.mockResolvedValue({ data: { key: "default_currency", value: "ARS" }, error: null });
    const { PATCH } = await import("@/app/api/admin/settings/route");
    const res = await PATCH(
      authed("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ key: "default_currency", value: "ARS" }) }),
      NO_CTX,
    );
    expect(res.status).toBe(200);
    expect(rpc.mock.calls[0]![0]).toBe("admin_settings_set");
    expect(insert).toHaveBeenCalled();
  });

  it("400 con clave desconocida", async () => {
    asAdmin();
    const { PATCH } = await import("@/app/api/admin/settings/route");
    const res = await PATCH(
      authed("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ key: "smtp_password", value: "x" }) }),
      NO_CTX,
    );
    expect(res.status).toBe(400);
  });
});

describe("movimientos", () => {
  it("400 con type inválido", async () => {
    asAdmin();
    const { GET } = await import("@/app/api/admin/movimientos/route");
    const res = await GET(authed("/api/admin/movimientos?type=refund"), NO_CTX);
    expect(res.status).toBe(400);
  });

  it("export devuelve CSV con content-disposition y escapa comas/comillas", async () => {
    asAdmin();
    rpc.mockResolvedValue({
      data: {
        total: 1,
        rows: [
          {
            type: "expense",
            id: "e1",
            group_id: "g1",
            group_name: "Viaje, 2026",
            currency: "ARS",
            amount_minor: 12345,
            description: 'con "comillas"',
            occurred_on: "2026-08-01",
            created_at: "2026-08-01T00:00:00Z",
          },
        ],
      },
      error: null,
    });
    const { GET } = await import("@/app/api/admin/movimientos/export/route");
    const res = await GET(authed("/api/admin/movimientos/export"), NO_CTX);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const text = await res.text();
    expect(text).toContain('"Viaje, 2026"');
    expect(text).toContain('"con ""comillas"""');
    expect(insert).toHaveBeenCalled(); // exportación auditada
  });
});

describe("groups / audit / status / settings GET", () => {
  it("groups traslada currency y archived a admin_list_groups", async () => {
    asAdmin();
    const { GET } = await import("@/app/api/admin/groups/route");
    await GET(authed("/api/admin/groups?currency=usd&archived=yes&sort=name&dir=asc"), NO_CTX);
    const [fn, args] = rpc.mock.calls[0]!;
    expect(fn).toBe("admin_list_groups");
    expect(args).toMatchObject({ p_currency: "usd", p_archived: "yes", p_sort: "name", p_dir: "asc" });
  });

  it("audit valida el filtro admin y traslada action/entity", async () => {
    asAdmin();
    const { GET } = await import("@/app/api/admin/audit/route");
    const bad = await GET(authed("/api/admin/audit?admin=not-a-uuid"), NO_CTX);
    expect(bad.status).toBe(400);

    rpc.mockClear();
    await GET(authed("/api/admin/audit?action=settings.update&entity=setting"), NO_CTX);
    expect(rpc.mock.calls[0]![0]).toBe("admin_audit_query");
    expect(rpc.mock.calls[0]![1]).toMatchObject({ p_action: "settings.update", p_entity: "setting" });
  });

  it("status devuelve app + checks", async () => {
    asAdmin();
    rpc.mockResolvedValue({ data: {}, error: null });
    const { GET } = await import("@/app/api/admin/status/route");
    const res = await GET(authed("/api/admin/status"), NO_CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("app.version");
    expect(body).toHaveProperty("checks.database");
  });

  it("settings GET expone las claves conocidas", async () => {
    asAdmin();
    rpc.mockResolvedValue({ data: { default_currency: "ARS", feature_flags: {} }, error: null });
    const { GET } = await import("@/app/api/admin/settings/route");
    const res = await GET(authed("/api/admin/settings"), NO_CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keys).toEqual(expect.arrayContaining(["default_currency", "feature_flags"]));
  });
});
