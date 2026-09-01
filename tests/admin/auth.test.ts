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

import { requireAdmin } from "@/lib/adminAuth";

const req = (headers: Record<string, string> = {}) =>
  new Request("http://x/api/admin/x", { headers });

beforeEach(() => {
  getUser.mockReset();
  maybeSingle.mockReset();
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
