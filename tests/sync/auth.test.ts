import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureAnonymousSession, getCurrentUserId } from "@/lib/supabase";

/**
 * Cliente falso con el subconjunto de la API de auth/realtime que usa
 * `ensureAnonymousSession`.
 */
function fakeClient(initialSession: unknown) {
  const calls = { signInAnonymously: 0, setAuth: [] as string[] };
  const anonSession = {
    access_token: "anon-token",
    user: { id: "anon-user" },
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: initialSession } }),
      signInAnonymously: async () => {
        calls.signInAnonymously++;
        return { data: { session: anonSession }, error: null };
      },
    },
    realtime: {
      setAuth: (t: string) => {
        calls.setAuth.push(t);
      },
    },
  };
  return { client: client as unknown as SupabaseClient, calls, anonSession };
}

describe("ensureAnonymousSession", () => {
  it("sin sesión: crea un usuario anónimo y autoriza Realtime", async () => {
    const { client, calls } = fakeClient(null);
    const session = await ensureAnonymousSession(client);

    expect(calls.signInAnonymously).toBe(1);
    expect(calls.setAuth).toEqual(["anon-token"]);
    expect(session?.user.id).toBe("anon-user");
  });

  it("con sesión existente: no vuelve a firmar, pero re-autoriza Realtime", async () => {
    const existing = {
      access_token: "existing-token",
      user: { id: "existing-user" },
    };
    const { client, calls } = fakeClient(existing);
    const session = await ensureAnonymousSession(client);

    expect(calls.signInAnonymously).toBe(0);
    expect(calls.setAuth).toEqual(["existing-token"]);
    expect(session?.user.id).toBe("existing-user");
  });

  it("propaga el error si el sign-in anónimo falla (p. ej. deshabilitado)", async () => {
    const client = {
      auth: {
        getSession: async () => ({ data: { session: null } }),
        signInAnonymously: async () => ({
          data: { session: null },
          error: new Error("Anonymous sign-ins are disabled"),
        }),
      },
      realtime: { setAuth: () => {} },
    } as unknown as SupabaseClient;

    await expect(ensureAnonymousSession(client)).rejects.toThrow(/disabled/i);
  });
});

describe("getCurrentUserId", () => {
  it("devuelve el id de la sesión o null", async () => {
    const withSession = {
      auth: {
        getSession: async () => ({
          data: { session: { user: { id: "u-42" } } },
        }),
      },
    } as unknown as SupabaseClient;
    expect(await getCurrentUserId(withSession)).toBe("u-42");

    const without = {
      auth: { getSession: async () => ({ data: { session: null } }) },
    } as unknown as SupabaseClient;
    expect(await getCurrentUserId(without)).toBeNull();
  });
});
