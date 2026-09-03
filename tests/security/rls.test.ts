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

  // Entorno tipo Supabase que las migraciones dan por hecho. `auth.uid()` lee
  // el JSON de claims (como en Supabase real) y `anon`/`authenticated` tienen
  // USAGE sobre el schema `auth` — necesario porque las policies llaman
  // `auth.uid()` directamente como el rol invocante (no vía SECURITY DEFINER).
  await pg.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema if not exists auth;
    create table auth.users (
      id uuid primary key,
      email text,
      is_anonymous boolean not null default true,
      last_sign_in_at timestamptz,
      banned_until timestamptz,
      created_at timestamptz not null default now()
    );
    create or replace function auth.uid() returns uuid
      language sql stable
      as $$ select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
      )::uuid $$;
    create publication supabase_realtime;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);

  for (const file of [
    "0001_init.sql",
    "0002_sync_and_policies.sql",
    "0003_sync_revision.sql",
    "0004_referential_integrity.sql",
    "0005_membership.sql",
    "0006_invites.sql",
    "0007_rls_auth.sql",
    "0008_groups_select_creator.sql",
    "0009_group_archive.sql",
    "0010_admin.sql",
    "0011_admin_functions.sql",
    "0012_admin_auth_access.sql",
    "0013_created_by.sql",
    "0014_exchange_rates.sql",
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
    grant usage on sequence public.sync_revision_seq to authenticated;
    grant select on public.groups to anon;
  `);

  // En Supabase real, las funciones del panel (0011) sólo se conceden a
  // `service_role` vía default privileges; acá el grant de arriba es un comodín,
  // así que replicamos el revoke que hace la migración.
  await pg.exec(`
    do $$
    declare f record;
    begin
      for f in
        select p.oid::regprocedure::text as sig
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname ~ '^admin_'
      loop
        execute format('revoke execute on function %s from anon, authenticated', f.sig);
      end loop;
    end $$;
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

  it("crear un grupo con RETURNING funciona (el creador se ve a sí mismo, 0008)", async () => {
    // Antes de 0008, INSERT ... RETURNING fallaba: la re-lectura de la fila
    // recién insertada corría la policy de SELECT antes de que el trigger AFTER
    // creara la membresía de owner.
    const id = randomUUID();
    const r = await asUser(U1, (tx) =>
      tx.query<{ id: string; created_by: string }>(
        `insert into public.groups (id, name, currency_code)
         values ($1, 'con returning', 'ARS')
         returning id, created_by`,
        [id],
      ),
    );
    expect(r.rows[0]?.id).toBe(id);
    expect(r.rows[0]?.created_by).toBe(U1);

    // y un ajeno sigue sin poder verlo (created_by es de U1)
    const outsider = await asUser(U2, (tx) =>
      tx.query("select id from public.groups where id = $1", [id]),
    );
    expect(outsider.rows).toHaveLength(0);
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

describe("RLS: archivado y snapshot (0009)", () => {
  it("archivar un grupo (archived_at) dispara el snapshot en group_archives", async () => {
    const gid = await createGroupAs(U1, "Para archivar");
    // un gasto para que el snapshot tenga contenido
    const pid = randomUUID();
    const eid = randomUUID();
    await asUser(U1, async (tx) => {
      await tx.query(
        "insert into public.participants (id, group_id, name) values ($1, $2, 'Ana')",
        [pid, gid],
      );
      await tx.query(
        `insert into public.expenses (id, group_id, description, amount_minor_units, paid_by, expense_date, split_strategy)
         values ($1, $2, 'Cena', 5000, $3, '2026-08-01', '{"kind":"equal"}'::jsonb)`,
        [eid, gid, pid],
      );
      await tx.query(
        "update public.groups set archived_at = now() where id = $1",
        [gid],
      );
    });

    const snap = await asUser(U1, (tx) =>
      tx.query<{ snapshot: Record<string, unknown> }>(
        "select snapshot from public.group_archives where group_id = $1",
        [gid],
      ),
    );
    expect(snap.rows).toHaveLength(1);
    const s = snap.rows[0]!.snapshot as {
      group: { id: string };
      expenses: unknown[];
      participants: unknown[];
    };
    expect(s.group.id).toBe(gid);
    expect(s.expenses).toHaveLength(1);
    expect(s.participants).toHaveLength(1);
  });

  it("un ajeno no puede leer el snapshot de un grupo del que no es miembro", async () => {
    const gid = await createGroupAs(U1, "Privado");
    await asUser(U1, (tx) =>
      tx.query("update public.groups set archived_at = now() where id = $1", [
        gid,
      ]),
    );
    const rows = await asUser(U2, (tx) =>
      tx.query("select group_id from public.group_archives where group_id = $1", [
        gid,
      ]),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it("re-archivar no duplica ni pisa el snapshot con timestamp nuevo si ya estaba archivado", async () => {
    const gid = await createGroupAs(U1, "Doble archivado");
    await asUser(U1, (tx) =>
      tx.query("update public.groups set archived_at = now() where id = $1", [
        gid,
      ]),
    );
    const first = await asUser(U1, (tx) =>
      tx.query<{ archived_at: string }>(
        "select archived_at from public.group_archives where group_id = $1",
        [gid],
      ),
    );
    // segundo update de archived_at con el grupo ya archivado: el trigger no
    // vuelve a snapshotear (old.archived_at no es null).
    await asUser(U1, (tx) =>
      tx.query(
        "update public.groups set archived_at = now() + interval '1 day' where id = $1",
        [gid],
      ),
    );
    const again = await asUser(U1, (tx) =>
      tx.query<{ archived_at: string }>(
        "select archived_at from public.group_archives where group_id = $1",
        [gid],
      ),
    );
    expect(again.rows[0]!.archived_at).toEqual(first.rows[0]!.archived_at);
  });
});

describe("panel admin (0010)", () => {
  it("app_admins / admin_audit_log / admin_settings: authenticated y anon no obtienen datos", async () => {
    await pg.exec("set role postgres");
    await pg.query(
      "insert into public.app_admins (user_id) values ($1) on conflict do nothing",
      [U3],
    );
    await pg.query(
      "insert into public.admin_audit_log (admin_user_id, action) values ($1, 'x')",
      [U3],
    );
    await pg.exec("reset role");

    for (const role of ["authenticated", "anon"]) {
      for (const tbl of ["app_admins", "admin_audit_log", "admin_settings"]) {
        // RLS sin policy => 0 filas; sin GRANT => permission denied. Ambos = sin datos.
        const rows = await pg
          .transaction(async (tx) => {
            await tx.exec(`set local role ${role}`);
            return tx.query(`select * from public.${tbl}`);
          })
          .then((r) => r.rows as unknown[])
          .catch(() => [] as unknown[]);
        expect(rows).toHaveLength(0);
      }
    }
  });

  it("el trigger impide borrar el último administrador", async () => {
    await pg.exec("set role postgres");
    // el trigger BEFORE DELETE no corre en TRUNCATE, así que lo usamos para
    // partir de una tabla vacía y controlar el conteo.
    await pg.exec("truncate public.app_admins");
    await pg.query("insert into public.app_admins (user_id) values ($1), ($2)", [
      U1,
      U2,
    ]);
    // quitar uno mientras queda otro: OK
    await pg.query("delete from public.app_admins where user_id = $1", [U2]);
    expect(
      (await pg.query("select 1 from public.app_admins")).rows,
    ).toHaveLength(1);
    // quitar el último: rechazado por el trigger
    await expect(
      pg.query("delete from public.app_admins where user_id = $1", [U1]),
    ).rejects.toThrow(/último administrador/i);
    await pg.exec("reset role");
  });

  it("admin_settings trae los defaults seguros", async () => {
    await pg.exec("set role postgres");
    const r = await pg.query<{ key: string }>(
      "select key from public.admin_settings order by key",
    );
    await pg.exec("reset role");
    expect(r.rows.map((x) => x.key)).toEqual([
      "default_currency",
      "feature_flags",
    ]);
  });
});

describe("funciones admin (0011)", () => {
  /** Ejecuta una función SQL como `postgres` (equivalente a service_role). */
  async function rpc<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T> {
    await pg.exec("set role postgres");
    try {
      const r = await pg.query<{ out: T }>(`select ${sql} as out`, params);
      return r.rows[0]!.out;
    } finally {
      await pg.exec("reset role");
    }
  }

  beforeAll(async () => {
    // Datos deterministas para las agregaciones (además de lo que dejaron los
    // describe anteriores). Todo como `postgres`.
    await pg.exec("set role postgres");
    await pg.exec("truncate public.app_admins");
    await pg.query("insert into public.app_admins (user_id) values ($1)", [U1]);
    const gid = randomUUID();
    const p1 = randomUUID();
    const p2 = randomUUID();
    await pg.query(
      "insert into public.groups (id, name, currency_code, created_by) values ($1, '0011 grupo', 'USD', $2)",
      [gid, U1],
    );
    await pg.query(
      "insert into public.participants (id, group_id, name) values ($1,$2,'A'), ($3,$2,'B')",
      [p1, gid, p2],
    );
    await pg.query(
      `insert into public.expenses (id, group_id, description, amount_minor_units, paid_by, expense_date)
       values ($1,$2,'Hotel',150000,$3,current_date), ($4,$2,'Nafta',30000,$3,current_date)`,
      [randomUUID(), gid, p1, randomUUID()],
    );
    await pg.query(
      `insert into public.payments (id, group_id, from_participant, to_participant, amount_minor_units, payment_date)
       values ($1,$2,$3,$4,50000,current_date)`,
      [randomUUID(), gid, p2, p1],
    );
    await pg.exec("reset role");
  });

  it("admin_dashboard agrega usuarios, grupos, movimientos y series de 12 meses", async () => {
    const d = await rpc<{
      users: { total: number };
      groups: { total: number };
      movements: { total: number; by_type: { type: string; count: number }[] };
      volume_in_range: { currency: string; total_minor: number }[];
      monthly: unknown[];
    }>(
      "public.admin_dashboard($1,$2,$3,$4)",
      [
        new Date(Date.now() - 30 * 864e5).toISOString(),
        new Date(Date.now() + 864e5).toISOString(),
        new Date(Date.now() - 60 * 864e5).toISOString(),
        new Date(Date.now() - 30 * 864e5).toISOString(),
      ],
    );
    expect(d.users.total).toBeGreaterThanOrEqual(3);
    expect(d.groups.total).toBeGreaterThanOrEqual(1);
    expect(d.movements.total).toBeGreaterThanOrEqual(3);
    expect(d.monthly).toHaveLength(12);
    const usd = d.volume_in_range.find((v) => v.currency === "USD");
    expect(usd?.total_minor).toBeGreaterThanOrEqual(230000); // 150000+30000+50000
  });

  it("admin_list_groups pagina, cuenta y ordena", async () => {
    const r = await rpc<{
      total: number;
      rows: { name: string; expense_count: number; payment_count: number }[];
    }>("public.admin_list_groups($1,null,null,null,null,$2,$3,$4,0)", [
      "0011",
      "created_at",
      "desc",
      10,
    ]);
    expect(r.total).toBeGreaterThanOrEqual(1);
    const g = r.rows.find((x) => x.name === "0011 grupo");
    expect(g?.expense_count).toBe(2);
    expect(g?.payment_count).toBe(1);
  });

  it("admin_list_movements unifica gastos y pagos y respeta el filtro por tipo", async () => {
    const all = await rpc<{ total: number; rows: { type: string }[] }>(
      "public.admin_list_movements(null,null,'USD',null,null,null,'created_at','desc',100,0)",
    );
    expect(all.total).toBeGreaterThanOrEqual(3);
    const onlyPayments = await rpc<{ rows: { type: string }[] }>(
      "public.admin_list_movements('payment',null,'USD',null,null,null,'created_at','desc',100,0)",
    );
    expect(onlyPayments.rows.every((r) => r.type === "payment")).toBe(true);
    expect(onlyPayments.rows.length).toBeGreaterThanOrEqual(1);
  });

  it("admin_list_users filtra por rol admin", async () => {
    const admins = await rpc<{ rows: { id: string; is_admin: boolean }[] }>(
      "public.admin_list_users(null,null,'admin',null,null,'created_at','desc',50,0)",
    );
    expect(admins.rows.length).toBe(1);
    expect(admins.rows[0]!.id).toBe(U1);
    expect(admins.rows[0]!.is_admin).toBe(true);
  });

  it("admin_set_user_admin concede y protege el último administrador", async () => {
    const grant = await rpc<{ is_admin: boolean; admin_count: number }>(
      "public.admin_set_user_admin($1,true,$2)",
      [U2, U1],
    );
    expect(grant).toMatchObject({ is_admin: true, admin_count: 2 });

    const revoke = await rpc<{ is_admin: boolean; admin_count: number }>(
      "public.admin_set_user_admin($1,false,$2)",
      [U1, U2],
    );
    expect(revoke).toMatchObject({ is_admin: false, admin_count: 1 });

    await pg.exec("set role postgres");
    await expect(
      pg.query("select public.admin_set_user_admin($1,false,$2)", [U2, U2]),
    ).rejects.toThrow(/último administrador/i);
    await pg.exec("reset role");
  });

  it("admin_set_user_ban da de baja/alta y nunca a un administrador", async () => {
    const banned = await rpc<{ banned_until: string | null }>(
      "public.admin_set_user_ban($1,true)",
      [U3],
    );
    expect(banned.banned_until).not.toBeNull();
    const active = await rpc<{ banned_until: string | null }>(
      "public.admin_set_user_ban($1,false)",
      [U3],
    );
    expect(active.banned_until).toBeNull();

    await pg.exec("set role postgres");
    await expect(
      pg.query("select public.admin_set_user_ban($1,true)", [U2]), // U2 quedó admin
    ).rejects.toThrow(/administrador/i);
    await pg.exec("reset role");
  });

  it("admin_settings_set valida contra la clave y audita el valor", async () => {
    const out = await rpc<{ key: string; value: string }>(
      "public.admin_settings_set('default_currency', $1::jsonb, $2)",
      ['"USD"', U1],
    );
    expect(out.key).toBe("default_currency");
    const all = await rpc<Record<string, unknown>>("public.admin_settings_get()");
    expect(all.default_currency).toBe("USD");
  });

  it("admin_audit_query filtra por acción", async () => {
    await pg.exec("set role postgres");
    await pg.query(
      "insert into public.admin_audit_log (admin_user_id, action, entity) values ($1,'user.deactivate','user')",
      [U1],
    );
    await pg.exec("reset role");
    const r = await rpc<{ total: number; rows: { action: string }[] }>(
      "public.admin_audit_query(null,'user.deactivate',null,null,null,50,0)",
    );
    expect(r.total).toBeGreaterThanOrEqual(1);
    expect(r.rows.every((x) => x.action === "user.deactivate")).toBe(true);
  });

  it("authenticated y anon no pueden ejecutar las funciones del panel", async () => {
    for (const role of ["authenticated", "anon"]) {
      await expect(
        pg.transaction(async (tx) => {
          await tx.exec(`set local role ${role}`);
          return tx.query("select public.admin_settings_get()");
        }),
      ).rejects.toThrow(/permission denied/i);
    }
  });
});

describe("acceso a auth.users desde las funciones admin (0012)", () => {
  it("las 4 funciones que leen usuarios son SECURITY DEFINER con search_path fijo", async () => {
    // Sin esto, `service_role` (que no tiene SELECT sobre auth.users) hacía
    // fallar /api/admin/users y /api/admin/metrics en producción.
    await pg.exec("set role postgres");
    const r = await pg.query<{
      proname: string;
      prosecdef: boolean;
      proconfig: string[] | null;
    }>(`select proname, prosecdef, proconfig
          from pg_proc
         where pronamespace = 'public'::regnamespace
           and proname in ('admin_dashboard','admin_list_users','admin_get_user','admin_set_user_ban')
         order by proname`);
    await pg.exec("reset role");

    expect(r.rows.map((x) => x.proname)).toEqual([
      "admin_dashboard",
      "admin_get_user",
      "admin_list_users",
      "admin_set_user_ban",
    ]);
    for (const fn of r.rows) {
      expect(fn.prosecdef, `${fn.proname} debe ser SECURITY DEFINER`).toBe(true);
      expect(
        (fn.proconfig ?? []).join(","),
        `${fn.proname} debe fijar search_path`,
      ).toMatch(/search_path=/);
    }
  });

  it("las que sólo tocan `public` siguen siendo SECURITY INVOKER", async () => {
    await pg.exec("set role postgres");
    const r = await pg.query<{ proname: string; prosecdef: boolean }>(
      `select proname, prosecdef from pg_proc
        where pronamespace = 'public'::regnamespace
          and proname in ('admin_list_groups','admin_list_movements','admin_audit_query','admin_settings_get')`,
    );
    await pg.exec("reset role");
    for (const fn of r.rows) {
      expect(fn.prosecdef, `${fn.proname} no necesita DEFINER`).toBe(false);
    }
  });

  it("SECURITY DEFINER no abre la puerta: anon/authenticated siguen sin poder ejecutarlas", async () => {
    for (const role of ["authenticated", "anon"]) {
      await expect(
        pg.transaction(async (tx) => {
          await tx.exec(`set local role ${role}`);
          return tx.query(
            "select public.admin_list_users(null,null,null,null,null,'created_at','desc',10,0)",
          );
        }),
      ).rejects.toThrow(/permission denied/i);
    }
  });
});
