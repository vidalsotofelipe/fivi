/**
 * Tests de RLS (Etapa 7) contra un Postgres real en proceso (`@electric-sql/pglite`).
 *
 * No hay GoTrue: se stubea `auth.uid()` leyendo el GUC `request.jwt.claim.sub`,
 * igual que hace `supabase test db`. Cada escenario corre dentro de una
 * transacción con `set local role authenticated` + el sub del usuario, así RLS
 * se aplica de verdad (el rol `authenticated` no es dueño de las tablas ni
 * superusuario).
 *
 * Cubre los escenarios pedidos y la revisión de seguridad:
 *  - miembro lee su grupo; ajeno no; conocer el UUID no da acceso;
 *  - ajeno no puede modificar el grupo ni insertar movimientos en él;
 *  - ajeno no puede tocar group_members;
 *  - invitación válida deja unirse; revocada/expirada falla; doble canje es no-op;
 *  - crear un grupo deja al creador como owner automáticamente.
 */
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MIG_DIR = fileURLToPath(
  new URL("../../supabase/migrations/", import.meta.url),
);

/**
 * pglite no trae `pgcrypto`. 0001 lo declara (`create extension … pgcrypto`) pero
 * NINGUNA migración usa funciones de pgcrypto: los UUID de PK los pone el
 * cliente, y 0006 hashea con `sha256()`/`convert_to()`, que son del core de
 * Postgres (>= 14; pglite es 16). Se quita esa línea sólo para el test.
 */
function migration(f: string): string {
  return readFileSync(MIG_DIR + f, "utf8").replace(
    /create extension[^;]*pgcrypto[^;]*;/gi,
    "",
  );
}

const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const U3 = "33333333-3333-3333-3333-333333333333";

interface Tx {
  query<R = Record<string, unknown>>(
    q: string,
    params?: unknown[],
  ): Promise<{ rows: R[] }>;
  exec(q: string): Promise<unknown>;
}

let pg: PGlite;

/** Corre `fn` como el usuario `uid` (rol `authenticated` + sub del JWT). */
async function asUser<T>(uid: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return pg.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    return fn(tx as unknown as Tx);
  });
}

/** Inserta un grupo como `uid` y devuelve su id (el trigger lo vuelve owner). */
async function createGroupAs(uid: string, name = "G"): Promise<string> {
  const id = randomUUID();
  await asUser(uid, (tx) =>
    tx.query(
      "insert into public.groups (id, name, currency_code) values ($1, $2, 'ARS')",
      [id, name],
    ),
  );
  return id;
}

beforeAll(async () => {
  pg = new PGlite();

  // Entorno tipo Supabase que las migraciones dan por hecho.
  await pg.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema if not exists auth;
    create table auth.users (
      id uuid primary key,
      created_at timestamptz not null default now()
    );
    create or replace function auth.uid() returns uuid
      language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create publication supabase_realtime;
  `);

  for (const file of [
    "0001_init.sql",
    "0002_sync_and_policies.sql",
    "0003_sync_revision.sql",
    "0004_referential_integrity.sql",
    "0005_membership.sql",
    "0006_invites.sql",
    "0007_rls_auth.sql",
  ]) {
    await pg.exec(migration(file));
  }

  // Supabase concede privilegios de tabla por default a `anon`/`authenticated`;
  // acá a mano. Para `anon` alcanza con `select on groups`: así el test
  // comprueba que lo que lo frena es RLS (0 filas), no la falta de GRANT.
  // (0005/0006 hacen `revoke … from anon` sobre group_members / group_invites.)
  await pg.exec(`
    grant usage on schema public to anon, authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    grant select on public.groups to anon;
  `);

  await pg.query("insert into auth.users (id) values ($1), ($2), ($3)", [
    U1,
    U2,
    U3,
  ]);
});

afterAll(async () => {
  await pg.close();
});

describe("RLS: acceso a grupos", () => {
  it("crear un grupo deja al creador como owner (trigger)", async () => {
    const gid = await createGroupAs(U1, "Viaje");

    const m = await pg.query<{ role: string }>(
      "select role from public.group_members where group_id = $1 and user_id = $2",
      [gid, U1],
    );
    expect(m.rows).toEqual([{ role: "owner" }]);

    const g = await pg.query<{ created_by: string }>(
      "select created_by from public.groups where id = $1",
      [gid],
    );
    expect(g.rows[0]?.created_by).toBe(U1);
  });

  it("un miembro lee su grupo; un ajeno no lo ve aunque conozca el UUID", async () => {
    const gid = await createGroupAs(U1);

    const mine = await asUser(U1, (tx) =>
      tx.query("select id from public.groups where id = $1", [gid]),
    );
    expect(mine.rows).toHaveLength(1);

    const theirs = await asUser(U2, (tx) =>
      tx.query("select id from public.groups where id = $1", [gid]),
    );
    expect(theirs.rows).toHaveLength(0);
  });

  it("un ajeno no puede modificar el grupo", async () => {
    const gid = await createGroupAs(U1, "Original");

    const upd = await asUser(U2, (tx) =>
      tx.query(
        "update public.groups set name = 'hackeado' where id = $1 returning id",
        [gid],
      ),
    );
    expect(upd.rows).toHaveLength(0); // RLS `using` filtra la fila

    const after = await pg.query<{ name: string }>(
      "select name from public.groups where id = $1",
      [gid],
    );
    expect(after.rows[0]?.name).toBe("Original");
  });

  it("un ajeno no puede insertar un gasto apuntando a un grupo que no es suyo", async () => {
    const gid = await createGroupAs(U1);
    const pid = randomUUID();
    await asUser(U1, (tx) =>
      tx.query(
        "insert into public.participants (id, group_id, name) values ($1, $2, 'Ana')",
        [pid, gid],
      ),
    );

    await expect(
      asUser(U2, (tx) =>
        tx.query(
          `insert into public.expenses
             (id, group_id, description, amount_minor_units, paid_by, expense_date)
           values ($1, $2, 'Trucho', 1000, $3, current_date)`,
          [randomUUID(), gid, pid],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("un ajeno no puede agregarse a group_members ni cambiar roles", async () => {
    const gid = await createGroupAs(U1);

    await expect(
      asUser(U2, (tx) =>
        tx.query(
          "insert into public.group_members (group_id, user_id, role) values ($1, $2, 'owner')",
          [gid, U2],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);

    const upd = await asUser(U2, (tx) =>
      tx.query(
        "update public.group_members set role = 'owner' where group_id = $1 returning user_id",
        [gid],
      ),
    );
    expect(upd.rows).toHaveLength(0);
  });

  it("un miembro puede salirse pero no expulsar a otro; sólo el owner expulsa", async () => {
    const gid = await createGroupAs(U1); // U1 owner
    const token = "tok-" + randomUUID();
    const hashHex = createHash("sha256").update(token, "utf8").digest("hex");
    await asUser(U1, (tx) =>
      tx.query(
        "insert into public.group_invites (group_id, token_hash) values ($1, decode($2,'hex'))",
        [gid, hashHex],
      ),
    );
    await asUser(U2, (tx) =>
      tx.query("select public.redeem_group_invite($1)", [token]),
    ); // U2 member
    await asUser(U3, (tx) =>
      tx.query("select public.redeem_group_invite($1)", [token]),
    ); // U3 member

    // U2 (member) no puede expulsar a U3
    const kick = await asUser(U2, (tx) =>
      tx.query(
        "delete from public.group_members where group_id = $1 and user_id = $2 returning user_id",
        [gid, U3],
      ),
    );
    expect(kick.rows).toHaveLength(0);

    // U2 puede salirse a sí mismo
    const leave = await asUser(U2, (tx) =>
      tx.query(
        "delete from public.group_members where group_id = $1 and user_id = $2 returning user_id",
        [gid, U2],
      ),
    );
    expect(leave.rows).toHaveLength(1);

    // el owner sí puede expulsar a U3
    const ownerKick = await asUser(U1, (tx) =>
      tx.query(
        "delete from public.group_members where group_id = $1 and user_id = $2 returning user_id",
        [gid, U3],
      ),
    );
    expect(ownerKick.rows).toHaveLength(1);
  });
});

describe("RLS: invitaciones", () => {
  /** Crea un grupo de U1 + una invitación; devuelve { gid, token }. */
  async function groupWithInvite(): Promise<{ gid: string; token: string }> {
    const gid = await createGroupAs(U1);
    const token = "tok-" + randomUUID();
    const hashHex = createHash("sha256").update(token, "utf8").digest("hex");
    await asUser(U1, (tx) =>
      tx.query(
        "insert into public.group_invites (group_id, token_hash) values ($1, decode($2, 'hex'))",
        [gid, hashHex],
      ),
    );
    return { gid, token };
  }

  it("una invitación válida permite unirse y luego ver el grupo", async () => {
    const { gid, token } = await groupWithInvite();

    const redeemed = await asUser(U2, (tx) =>
      tx.query<{ redeem_group_invite: string }>(
        "select public.redeem_group_invite($1) as redeem_group_invite",
        [token],
      ),
    );
    expect(redeemed.rows[0]?.redeem_group_invite).toBe(gid);

    const seen = await asUser(U2, (tx) =>
      tx.query("select id from public.groups where id = $1", [gid]),
    );
    expect(seen.rows).toHaveLength(1);

    const role = await pg.query<{ role: string }>(
      "select role from public.group_members where group_id = $1 and user_id = $2",
      [gid, U2],
    );
    expect(role.rows[0]?.role).toBe("member");
  });

  it("canjear dos veces el mismo usuario es idempotente (uses no sube)", async () => {
    const { gid, token } = await groupWithInvite();
    await asUser(U2, (tx) =>
      tx.query("select public.redeem_group_invite($1)", [token]),
    );
    await asUser(U2, (tx) =>
      tx.query("select public.redeem_group_invite($1)", [token]),
    );

    const uses = await pg.query<{ uses: number }>(
      "select uses from public.group_invites where group_id = $1",
      [gid],
    );
    expect(uses.rows[0]?.uses).toBe(1);

    const members = await pg.query<{ n: number }>(
      "select count(*)::int as n from public.group_members where group_id = $1 and user_id = $2",
      [gid, U2],
    );
    expect(members.rows[0]?.n).toBe(1);
  });

  it("una invitación revocada no se puede canjear", async () => {
    const { gid, token } = await groupWithInvite();
    await pg.query(
      "update public.group_invites set revoked_at = now() where group_id = $1",
      [gid],
    );
    await expect(
      asUser(U3, (tx) =>
        tx.query("select public.redeem_group_invite($1)", [token]),
      ),
    ).rejects.toThrow(/revocada/i);
  });

  it("una invitación vencida no se puede canjear", async () => {
    const { gid, token } = await groupWithInvite();
    await pg.query(
      "update public.group_invites set expires_at = now() - interval '1 hour' where group_id = $1",
      [gid],
    );
    await expect(
      asUser(U3, (tx) =>
        tx.query("select public.redeem_group_invite($1)", [token]),
      ),
    ).rejects.toThrow(/expir/i);
  });

  it("un token que no existe falla", async () => {
    await expect(
      asUser(U2, (tx) =>
        tx.query("select public.redeem_group_invite($1)", ["no-existe"]),
      ),
    ).rejects.toThrow(/no encontrada/i);
  });

  it("una invitación agota max_uses y no admite un usuario más", async () => {
    const { gid, token } = await groupWithInvite();
    await pg.query(
      "update public.group_invites set max_uses = 1 where group_id = $1",
      [gid],
    );
    await asUser(U2, (tx) =>
      tx.query("select public.redeem_group_invite($1)", [token]),
    ); // consume el único uso
    await expect(
      asUser(U3, (tx) =>
        tx.query("select public.redeem_group_invite($1)", [token]),
      ),
    ).rejects.toThrow(/l[íi]mite de usos/i);
  });

  it("conocer el UUID del grupo no reemplaza a la invitación", async () => {
    const gid = await createGroupAs(U1);
    const seen = await asUser(U2, (tx) =>
      tx.query("select id from public.groups where id = $1", [gid]),
    );
    expect(seen.rows).toHaveLength(0);
  });
});

describe("RLS: rol anon", () => {
  it("anon no ve ningún grupo", async () => {
    await createGroupAs(U1);
    const rows = await pg.transaction(async (tx) => {
      await tx.exec("set local role anon");
      const r = await tx.query("select id from public.groups");
      return r.rows;
    });
    expect(rows).toHaveLength(0);
  });

  it("no quedan policies permisivas `to anon` sobre datos privados", async () => {
    const r = await pg.query(`
      select tablename, policyname
      from pg_policies
      where schemaname = 'public'
        and 'anon' = any(roles)
    `);
    expect(r.rows).toHaveLength(0);
  });
});
