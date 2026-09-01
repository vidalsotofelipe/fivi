import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const maybeSingle = vi.fn();

vi.mock("@/lib/supabaseAdmin", () => ({
  adminConfigured: () => true,
  getAdminClient: () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));

import { ACCESS_KEY_ADMIN_ID, requireAdmin } from "@/lib/adminAuth";

const req = (headers: Record<string, string> = {}) =>
  new Request("http://x/api/admin/x", { headers });

beforeEach(() => {
  getUser.mockReset();
  maybeSingle.mockReset();
  delete process.env.ADMIN_ACCESS_KEY;
});

describe("requireAdmin", () => {
  it("401 sin bearer token", async () => {
    await expect(requireAdmin(req())).rejects.toMatchObject({ status: 401 });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("401 con token inválido", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });
    await expect(
      requireAdmin(req({ authorization: "Bearer nope" })),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("403 autenticado pero no está en app_admins", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "user@fivi.app" } },
      error: null,
    });
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(
      requireAdmin(req({ authorization: "Bearer tok" })),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("ok: admin devuelve { adminId, email }", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "admin@fivi.app" } },
      error: null,
    });
    maybeSingle.mockResolvedValue({ data: { user_id: "u1" }, error: null });
    await expect(
      requireAdmin(req({ authorization: "Bearer tok" })),
    ).resolves.toEqual({ adminId: "u1", email: "admin@fivi.app" });
  });

  it("acepta 'bearer' en minúscula y con espacios", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u2", email: null } },
      error: null,
    });
    maybeSingle.mockResolvedValue({ data: { user_id: "u2" }, error: null });
    await expect(
      requireAdmin(req({ authorization: "bearer   tok  " })),
    ).resolves.toEqual({ adminId: "u2", email: null });
  });
});

describe("requireAdmin · llave de acceso (ADMIN_ACCESS_KEY)", () => {
  const KEY = "llave-de-prueba-suficientemente-larga";

  it("la llave correcta entra sin tocar Supabase Auth", async () => {
    process.env.ADMIN_ACCESS_KEY = KEY;
    await expect(
      requireAdmin(req({ authorization: `Bearer ${KEY}` })),
    ).resolves.toEqual({ adminId: ACCESS_KEY_ADMIN_ID, email: null });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("una llave incorrecta cae al camino de sesión (y da 401)", async () => {
    process.env.ADMIN_ACCESS_KEY = KEY;
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });
    await expect(
      requireAdmin(req({ authorization: "Bearer llave-incorrecta-pero-larga" })),
    ).rejects.toMatchObject({ status: 401 });
    expect(getUser).toHaveBeenCalled();
  });

  it("sin ADMIN_ACCESS_KEY la llave no sirve: se valida como sesión", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });
    await expect(
      requireAdmin(req({ authorization: `Bearer ${KEY}` })),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("una llave demasiado corta se ignora (no habilita el modo)", async () => {
    process.env.ADMIN_ACCESS_KEY = "corta";
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });
    await expect(
      requireAdmin(req({ authorization: "Bearer corta" })),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("sigue exigiendo token: sin Authorization es 401", async () => {
    process.env.ADMIN_ACCESS_KEY = KEY;
    await expect(requireAdmin(req())).rejects.toMatchObject({ status: 401 });
  });
});
