# Panel de administración (`/administracion`)

> **Ruta canónica: `/administracion`.** La ruta vieja (`/admin`, `/admin/*`)
> redirige a `/administracion` conservando la query (`?k=…`), vía `redirects()`
> en `next.config.mjs`. Los endpoints siguen en `/api/admin/*` (backend; cada
> uno protegido por `requireAdmin`). La entrada nunca aparece en la navegación
> de la app de usuarios.

> Estado: **desplegado**. Requiere las migraciones `0010_admin.sql` y
> `0011_admin_functions.sql` aplicadas y la variable `SUPABASE_SERVICE_ROLE_KEY`.
>
> Incluye: autorización real (rol admin global + verificación por endpoint),
> dashboard con datos reales, gestión de usuarios, consulta de grupos y
> movimientos (con export CSV), auditoría, estado y configuración. Config
> avanzada, más exportaciones y el log de errores de negocio quedan como
> etapa 2 (ver § Riesgos y notas).

## Arquitectura

FIVI es local-first y no tiene servidor: el cliente habla directo con PostgREST
protegido por RLS. El panel admin necesita leer datos **agregados de todos los
grupos**, lo que RLS impide. Por eso el panel introduce:

- **Route Handlers** en `src/app/api/admin/*` (feature nativa de Next, sin
  dependencias nuevas). Corren en el servidor (Vercel Functions).
- Un cliente Supabase **service-role** (`src/lib/supabaseAdmin.ts`) que bypassa
  RLS. La clave vive en `SUPABASE_SERVICE_ROLE_KEY` (server-only, **nunca**
  `NEXT_PUBLIC_`).
- `requireAdmin(req)` (`src/lib/adminAuth.ts`): cada endpoint verifica el bearer
  token del llamador contra Supabase Auth y que el usuario esté en
  `public.app_admins`. La UI (`/admin/*`) sólo oculta/redirige; **la seguridad
  está en los endpoints**.
- Autenticación del admin: **email + contraseña** (proveedor Email de Supabase),
  con signups públicos deshabilitados. El panel usa su propio cliente Supabase
  (storageKey aparte) para no mezclarse con la sesión anónima de la app.

## Migración `0010_admin.sql`

Aditiva y no destructiva. Crea:

- `app_admins (user_id, granted_by, granted_at)` — administradores globales.
  Trigger `app_admins_prevent_last_delete`: nunca se puede quedar sin admins.
- `admin_audit_log` — auditoría de acciones del panel.
- `admin_settings` — configuración general (con defaults seguros).
- Índices en `created_at` / `created_by` de `expenses`/`payments`/`groups`/
  `participants` para las consultas agregadas.

Las tres tablas tienen RLS activada **sin policies**: sólo `service_role`
(el backend) las lee/escribe.

### Aplicar

En el **SQL Editor** de Supabase (proyecto de producción o el que uses), pegar
el contenido de `supabase/migrations/0010_admin.sql` y ejecutar. Es idempotente
(`create ... if not exists`).

### Revertir

Ejecutar el bloque `ROLLBACK` que está comentado al pie de
`supabase/migrations/0010_admin.sql`. No borra datos de la app.

## Migración `0011_admin_functions.sql`

Aditiva. Crea funciones SQL de **sólo lectura** (`admin_dashboard`,
`admin_list_users`, `admin_get_user`, `admin_list_groups`, `admin_get_group`,
`admin_list_movements`, `admin_audit_query`) y de **acción**
(`admin_set_user_admin`, `admin_set_user_ban`, `admin_settings_get`,
`admin_settings_set`). Toda la agregación del panel se hace acá: el backend
nunca baja filas para calcular métricas.

Cada función tiene `revoke ... from public, anon, authenticated` + `grant
execute ... to service_role`: sólo el backend (cliente service-role) las llama.

- **Aplicar**: pegar el archivo en el SQL Editor y ejecutar (idempotente,
  `create or replace`).
- **Revertir**: bloque `ROLLBACK` comentado al pie (`drop function ...`). No
  toca datos.

## Endpoints (`/api/admin/*`)

Todos: `runtime = "nodejs"`, verifican `requireAdmin(req)` (Bearer token →
Supabase Auth → `app_admins`) y responden `401` / `403` / `503` si falla.
Paginación y filtros son server-side; el cálculo vive en las funciones de 0011.

| Método | Ruta | Para qué |
| --- | --- | --- |
| GET | `/api/admin/me` | whoami del admin autenticado |
| GET | `/api/admin/metrics?period=7\|30\|90` o `?from&to` | KPIs + series del dashboard (con comparativo del período previo) |
| GET | `/api/admin/users?search&status&role&sort&dir&page&limit` | listado paginado de usuarios |
| GET | `/api/admin/users/:id` | detalle de usuario + sus grupos |
| POST | `/api/admin/users/:id/ban` `{ ban: boolean }` | baja/alta lógica (`banned_until`); nunca a un admin |
| POST | `/api/admin/users/:id/admin` `{ make: boolean }` | conceder/quitar admin; protege el último |
| GET | `/api/admin/groups?search&currency&archived&sort&dir&page&limit` | listado paginado de grupos |
| GET | `/api/admin/groups/:id` | detalle de grupo |
| GET | `/api/admin/movimientos?type&group&currency&search&from&to&sort&dir&page&limit` | gastos + pagos unificados (sólo lectura) |
| GET | `/api/admin/movimientos/export?<mismos filtros>` | CSV de los movimientos filtrados (tope 5000 filas) |
| GET | `/api/admin/audit?admin&action&entity&from&to&page&limit` | consulta del log de auditoría |
| GET | `/api/admin/status` | versión/commit/entorno + ping a DB y Supabase Auth (sin secretos) |
| GET · PATCH | `/api/admin/settings` `{ key, value }` | leer/actualizar config validada (`default_currency` — ISO 4217 real; `timezone` — IANA; `feature_flags` — nombres `^[a-z][a-z0-9_.]{1,39}$`) |

Acciones auditadas en `admin_audit_log`: `dashboard.view`, `user.activate` /
`user.deactivate`, `admin.grant` / `admin.revoke`, `movimientos.export`,
`settings.update`.

### Limitaciones del modelo actual

- `expenses` / `payments` tienen `created_by` (desde `0013_created_by.sql`) pero
  apunta a un **participante** (un nombre dentro del grupo), no a un usuario de
  `auth.users`: un movimiento no se puede atribuir a una cuenta. El dashboard
  reporta volumen y conteos por grupo / moneda / tipo, no por usuario.
- No hay categorías: "distribución por tipo" = gasto vs. pago.
- No hay log de errores/eventos de la app: el panel de "estado" reporta
  diagnóstico de infra, no errores de negocio (propuesto para etapa 2: tabla
  `app_events` + beacon).

## Habilitar el proveedor Email

1. Supabase → **Authentication → Providers → Email**: activar.
2. En **Authentication → Providers → Email**, desactivar **"Enable email
   signups"** (así nadie se registra solo; los admins los creás vos).
3. Opcional: desactivar "Confirm email" para los usuarios que creás a mano.

## Asignar el **primer** administrador

`app_admins` arranca **vacía**. Nadie es admin hasta hacer esto:

1. **Crear el usuario admin** en Supabase → Authentication → Users → *Add user*
   → email + password (marcá "Auto Confirm User").
   Copiá el **UID** que aparece en la fila del usuario.

2. **Concederle admin** en el SQL Editor:

   ```sql
   insert into public.app_admins (user_id)
   values ('PEGÁ-ACÁ-EL-UID-DEL-USUARIO');
   ```

3. Entrar a `/administracion/login` con ese email y contraseña.

> A partir del segundo admin, se puede conceder/quitar desde el propio panel
> (sección Usuarios), con confirmación y sin poder quitar el último.

## Variables de entorno

| Variable | Dónde | Para qué |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only (Vercel env, `.env.local`) | cliente service-role del backend admin. Settings → API → *service_role secret*. |

Sin esta variable, `/api/admin/*` responde `503` y `/administracion` muestra "panel no
disponible".

## Estructura del panel (frontend)

- `src/app/administracion/layout.tsx` — layout propio (client). Monta `<AdminSession>`
  (cliente Supabase con `storageKey: "fivi-admin-auth"`, aislado de la sesión
  anónima de la app). `/administracion/login` queda fuera del guard y del shell.
- `AdminGuard` — defensa de UX: sin sesión → redirige a `/administracion/login`; con
  sesión pero backend responde 401 → redirige; 403 → "acceso denegado"; 503 →
  "panel no disponible". La seguridad real está en cada endpoint.
- `AdminShell` — sidebar (Dashboard, Usuarios, Grupos, Movimientos, Auditoría,
  Estado, Configuración) + topbar (badge de entorno, email, tema, salir);
  drawer en móvil. Reusa los tokens de FIVI con estructura de back-office.
- `src/lib/adminFetch.ts` + `useApi` — transporte con Bearer token y estados
  de carga/error; primitivas en `src/components/admin/ui.tsx` (skeletons,
  estados vacíos/errores, tabla con scroll contenido, paginación, `ConfirmDialog`).
- `SyncProvider` **no** arranca el motor local-first en rutas `/administracion`.

## Ejecutar el proyecto

```bash
npm install
npm run dev            # http://localhost:3000  ·  panel en /administracion
npm run test           # unit + RLS (incluye 0010 y 0011)
npm run test:e2e       # Playwright (incluye tests/e2e/admin.spec.ts)
npm run lint
npm run typecheck
npm run build
```

## Pruebas

| Archivo | Cubre |
| --- | --- |
| `tests/admin/auth.test.ts` | `requireAdmin`: 401 sin token / token inválido, 403 no-admin, ok admin |
| `tests/admin/routes.test.ts` | endpoints con cliente service-role mockeado: 401/403, validación de params, filtros/paginación → función SQL correcta, 409 en "último admin", CSV export, settings |
| `tests/security/rls.test.ts` → `panel admin (0010)` | `app_admins` / `admin_audit_log` / `admin_settings` no legibles por `anon`/`authenticated`; trigger del último admin; defaults |
| `tests/security/rls.test.ts` → `funciones admin (0011)` | `admin_dashboard` agrega bien; listados paginan/filtran/ordenan; `admin_set_user_admin` protege el último; `admin_set_user_ban` nunca a un admin; `anon`/`authenticated` no ejecutan las funciones |
| `tests/e2e/admin.spec.ts` | (build sin Supabase) endpoints → 401 sin token; `/administracion` y `/administracion/login` no exponen nada |

Estado: **210 tests** verdes · `typecheck` · `lint` · `build`.
El camino "usuario autenticado que **no** es admin → denegado" se prueba a nivel
unitario (rutas + `requireAdmin`); el e2e corre sin Supabase.

## Pantallas

| Ruta | Contenido |
| --- | --- |
| `/administracion/login` | Email + contraseña (cliente Supabase propio). |
| `/administracion` | Dashboard: KPIs con comparativo vs. período previo, gráfico de barras (12 meses), volumen por moneda, distribución gasto/pago, últimos usuarios y actividad, accesos rápidos. Selector 7/30/90 días. |
| `/administracion/usuarios` · `/[id]` | Tabla paginada (búsqueda email/id, filtros estado y rol, orden). Detalle con grupos y acciones (activar/desactivar, conceder/quitar admin) con confirmación. |
| `/administracion/grupos` · `/[id]` | Tabla paginada (búsqueda, moneda, archivado, orden). Detalle: metadatos, totales, participantes, miembros. |
| `/administracion/movimientos` | Gastos + pagos unificados (filtros type/moneda/fechas/búsqueda, orden) + exportar CSV de los filtrados. Sólo lectura. |
| `/administracion/auditoria` | Log paginado con filtros por admin, acción, entidad y rango; metadata expandible. |
| `/administracion/estado` | Versión, commit, entorno, host de Supabase y chequeos (DB + Auth) con latencia. |
| `/administracion/configuracion` | Moneda por defecto (selector de monedas soportadas), zona horaria (afecta cómo se muestran TODAS las fechas del panel; los datos siguen en UTC) y feature flags con validación de nombre; "Guardar" sólo se habilita con un cambio válido; cada cambio se confirma y se audita. |

Todas: estados de carga (skeletons), error (con "Reintentar") y vacío;
español; tablas con scroll horizontal contenido; navegación por teclado.

## Riesgos y notas

**Seguridad**
- El service-role key bypassa RLS: **todo** endpoint que use `getAdminClient()`
  llama primero a `requireAdmin(req)`. La clave nunca lleva `NEXT_PUBLIC_`.
- Las funciones de 0011 tienen `revoke ... from anon, authenticated` + `grant
  ... to service_role`: no son invocables desde el cliente.
- `AdminGuard` es sólo UX; no reemplaza la verificación por endpoint.
- El proveedor Email de Supabase debe quedar con **signups deshabilitados**
  (paso manual, documentado arriba). Si se habilitan, cualquiera se registra
  (aunque no sería admin hasta estar en `app_admins`).
- Baja lógica de usuarios vía `banned_until`; no se borra nada físicamente.

**Rendimiento**
- Métricas y listados se calculan en SQL (agregados); el backend no baja filas.
- Índices de 0010 en `created_at` de `expenses/payments/groups/participants`.
- Export CSV con tope de 5000 filas.
- `admin_dashboard` corre ~15 subconsultas: aceptable a la escala actual; si el
  volumen crece, conviene materializar la serie mensual.

**Limitaciones** (ver también arriba)
- `created_by` en `expenses/payments` es un participante (nombre), no una cuenta
  → no hay métricas por usuario de `auth.users`. La app sí lo usa para la
  actividad del grupo ("quién cargó el gasto").
- Sin categorías → distribución = gasto vs. pago.
- Sin log de errores de negocio → `/administracion/estado` es diagnóstico de infra.
- La zona horaria de visualización es configurable (Configuración → Zona
  horaria; default `America/Argentina/Buenos_Aires`). Se aplica en Dashboard,
  Usuarios, Grupos, Movimientos, Auditoría y Estado.
- Etapa 2 pendiente: tabla `app_events` + beacon para errores de negocio, más
  exportaciones, diagnóstico ampliado.

## Migración `0012_admin_auth_access.sql`

`service_role` tiene `USAGE` sobre el esquema `auth` pero **no `SELECT` sobre
`auth.users`**. Como las funciones de 0011 son `SECURITY INVOKER`, al llamarlas
por PostgREST fallaban justo las que leen usuarios (`/api/admin/users` → 500,
`/api/admin/metrics` → vacío), mientras que grupos/movimientos/auditoría
funcionaban.

0012 pasa a **`SECURITY DEFINER`** las cuatro funciones que tocan `auth.users`
(`admin_dashboard`, `admin_list_users`, `admin_get_user`, `admin_set_user_ban`)
y les fija `search_path = public, auth, pg_temp`. Sigue sin poder ejecutarlas
nadie más que `service_role` (el `revoke` de 0011 no cambia) y no hay SQL
dinámico, así que no se amplía la superficie de ataque. Sólo altera atributos:
no toca cuerpos ni firmas. Rollback al pie del archivo.

## Acceso provisorio con llave compartida

Mientras el panel está en pruebas se puede entrar **sin crear usuarios**, con una
llave compartida:

1. Generar la llave (mínimo 16 caracteres):

   ```bash
   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
   ```

2. Cargarla como variable **server-only** `ADMIN_ACCESS_KEY` (Vercel →
   Settings → Environment Variables → Production, o `vercel env add`).

3. Entrar una vez a `/administracion/login?k=<LLAVE>`. La llave se guarda en el
   `localStorage` de ese navegador (`fivi:admin-key`) y la URL se limpia; a
   partir de ahí `/administracion` entra directo. También se puede pegar a mano en el
   campo "Llave de acceso".

`requireAdmin` la compara en tiempo constante contra `ADMIN_ACCESS_KEY` y, si
coincide, devuelve la identidad sintética `access-key`. En la auditoría queda
`admin_user_id = null` y `metadata.auth = "access-key"`.

> **Es un secreto compartido, no una identidad.** Quien tenga la llave entra.
> No sirve para saber *quién* hizo cada acción. Sigue haciendo falta
> `SUPABASE_SERVICE_ROLE_KEY`: sin ella los endpoints responden 503.

### Volver a cuentas de administrador (etapa 2)

Quitar `ADMIN_ACCESS_KEY` del entorno. El camino de Supabase Auth
(`requireAdmin` modo 2 + `app_admins`) sigue intacto en el código; sólo hay que
devolver el formulario de email + contraseña a `/administracion/login`.
