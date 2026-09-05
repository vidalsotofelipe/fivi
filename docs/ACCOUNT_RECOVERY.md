# Cuenta y recuperación opcional — diseño

> Estado: **R1 implementado.** R2-R4 siguen diseñados, no implementados — ver
> § Etapas. R1: `updateUser({ email })` + UI "Guardar mi FIVI" en Ajustes
> generales (`src/components/AccountSection.tsx`, `SyncActions.linkEmail` en
> `src/components/SyncProvider.tsx`). Sin migración, sin cambio de `uid` —
> exactamente como se diseñó abajo.

## Objetivo

Permitir, **de forma totalmente opcional**, que una persona "guarde" sus grupos
y los recupere en otro dispositivo (teléfono nuevo, reinstalar la PWA, borrar los
datos del navegador), sin dejar de poder usar FIVI como usuario anónimo.

## Restricciones que se respetan

- FIVI sigue funcionando **sin registrarse**. No se pide cuenta para crear ni
  usar un grupo.
- Se continúa como usuario **anónimo** por defecto.
- Se reutiliza **Supabase Auth**, ya presente en la arquitectura (hoy: Anonymous
  Sign-In). No hay backend propio nuevo.
- El sistema de **invitaciones por token** no cambia: conocer el UUID de un grupo
  nunca alcanza para acceder.
- Al vincular una cuenta **no se pierden los grupos locales**.
- Se resuelven los conflictos local ↔ remoto.

## Idea central

FIVI ya identifica al dispositivo con un usuario de Supabase Auth
(`auth.uid()`), hoy **anónimo**. El acceso a los datos ya está scopeado por ese
uid mediante `group_members` + RLS (migración 0007). "Guardar mi FIVI" es
simplemente **convertir ese usuario anónimo en uno con email**, sin cambiar el
`uid`:

```
supabase.auth.updateUser({ email })   // manda un magic link / OTP al email
```

Cuando el usuario confirma el email:

- el **mismo `auth.users.id`** pasa a tener `email` + `is_anonymous = false`;
- **toda la membresía (`group_members`) y `created_by` siguen apuntando al mismo
  uid** → no hay que migrar ni re-vincular nada;
- en otro dispositivo, `signInWithOtp({ email })` (magic link) devuelve una
  sesión con **ese mismo `uid`** → RLS deja ver exactamente los mismos grupos
  (los que el usuario realmente tiene en `group_members`), y el pull baja todo.

Es decir: **la recuperación no necesita esquema nuevo.** El uid es la identidad;
el email sólo es una credencial de reingreso a ese uid.

## Qué SÍ hace falta

### 1. Habilitar el proveedor Email en Supabase (OTP / magic link)

- Authentication → Providers → **Email**: activar.
- **Confirm email = ON** (el link/OTP es la prueba de posesión).
- **"Enable email signups"**: puede quedar OFF; `updateUser({ email })` sobre un
  usuario anónimo funciona igual (no es un signup nuevo). `signInWithOtp` sobre
  un email ya conocido tampoco es un signup.
- `SITE_URL` / redirect URLs → el dominio de producción (para el magic link).

### 2. Endurecer RLS para cuentas con email

Con el modelo actual (0005–0007) el acceso ya depende de `group_members`. Hay un
solo punto a revisar:

- **`app_admins`** (panel admin, rama aparte) — no aplica a esta feature.
- **Anon → email**: `updateUser` mantiene `role = 'authenticated'`; las policies
  actuales usan `auth.uid()` + `is_group_member()`, así que **no cambian**.
- Añadir (defensa en profundidad) que **un anónimo no pueda "robar" un email ya
  usado**: Supabase Auth ya lo impide (`updateUser` con un email existente
  falla). No hace falta SQL.

**Conclusión: no se prevé migración de esquema.** Si en la implementación
aparece un caso que la requiera, será una migración **aditiva** (nueva
tabla/columna nullable) documentada en `supabase/migrations/`.

### 3. Merge local ↔ remoto al recuperar

Escenario: instalo FIVI nueva, la uso un rato como anónimo (creo un grupo local
"A"), y después hago "Recuperar" con mi email (que en la nube tiene los grupos
"B" y "C").

- **Antes de cambiar de sesión**, el motor hace un `push` completo de la cola
  pendiente con el uid anónimo actual → el grupo "A" queda en la nube atado al
  uid anónimo. **No se pierde** (queda en IndexedDB igual).
- `signInWithOtp` cambia el `uid` (anónimo → el de la cuenta con email).
- El grupo "A" quedó atado al uid anónimo viejo → con el uid nuevo **no se ve
  por RLS**. Sigue en IndexedDB local, pero "huérfano" en la nube.
  - **Opción elegida (simple y segura):** al recuperar, si hay grupos locales
    creados por el uid anónimo saliente, se ofrece **"Llevar estos grupos a mi
    cuenta"**: por cada uno, un RPC `claim_group(group_id)` (SECURITY DEFINER)
    que —sólo si `groups.created_by` = el uid anónimo de esta misma sesión y el
    grupo no tiene otros miembros con email— re-asigna `created_by` y la
    membresía `owner` al uid nuevo. Requiere pasar el `refresh_token`/uid
    anónimo saliente como prueba (se guarda en memoria antes del cambio de
    sesión).
  - Si el usuario no quiere llevarlos, quedan como grupos **sólo locales** (como
    hoy en modo local): funcionan en ese dispositivo, no se sincronizan.
- Los grupos "B"/"C" bajan por el primer pull completo tras el `SIGNED_IN`
  (el motor ya fuerza `forceFullPull` en `markRemoteReady`/`setRemote`).
- **Conflictos de datos** (una fila editada en dos lados): los resuelve
  `applyRemoteChanges` con **LWW por `updated_at`** — el mecanismo actual, sin
  cambios. IndexedDB es la fuente para la UI; el pull mergea.

### 4. UI

- **`/g/[groupId]/mas` → nueva sección "Proteger mis grupos"** (o en un lugar
  global, p. ej. un `/cuenta`):
  - Estado anónimo: botón **"Guardar mi FIVI"** → pide email → `updateUser({
    email })` → "Te mandamos un enlace a <email>. Abrilo para confirmar."
  - Estado con email confirmado: muestra el email + **"Cerrar sesión"** (vuelve a
    anónimo nuevo) y **"Cambiar email"**.
- **`/recuperar`** (o el mismo `/cuenta`): campo email → `signInWithOtp` → "Te
  mandamos un enlace". Al volver del link (`/auth/callback`), si hay grupos
  locales huérfanos → el diálogo "Llevar a mi cuenta".
- Todo con textos es/en, estados de carga/error, y **sin bloquear** el uso
  anónimo.

## Etapas (implementación segura e incremental)

| Etapa | Alcance | Riesgo |
| --- | --- | --- |
| **R1** ✅ | Habilitar proveedor Email en Supabase. `updateUser({ email })` + UI "Guardar mi FIVI" en Ajustes generales. Sólo **agrega** email al uid actual; no cambia de sesión. Reingreso en el MISMO dispositivo ya anda (sesión persistida). — **Implementado.** Falta el paso manual: activar el proveedor Email en el dashboard de Supabase (Authentication → Providers). | Bajo. Sin esquema. Reversible (quitar la UI). |
| **R2** | `/recuperar` con `signInWithOtp` + `/auth/callback`. Push de la cola pendiente ANTES del cambio de sesión. Primer pull completo tras `SIGNED_IN`. Grupos remotos de la cuenta aparecen. | Medio. Cambia el `uid` de la sesión. Cubierto por tests de "acceso por membresía" y "pull completo". |
| **R3** | Diálogo "Llevar grupos locales a mi cuenta" + RPC `claim_group` (migración **aditiva**: sólo la función). Manejo de huérfanos. | Medio. La RPC valida `created_by` + ausencia de otros miembros con email antes de re-asignar. Migración con rollback. |
| **R4** | Pulido: "Cambiar email", "Cerrar sesión" (→ nuevo anónimo), reintentos de OTP, rate-limit visible, textos. | Bajo. |

Cada etapa deja `typecheck` / `lint` / `test` / `e2e` / `build` en verde y no
rompe el uso anónimo ni los datos existentes.

## Pruebas previstas (por etapa)

- R1: `updateUser({ email })` agrega email sin cambiar `uid`; la UI aparece sólo
  en modo cloud; el flujo anónimo sigue intacto.
- R2: tras `signInWithOtp` en otro contexto, el pull trae exactamente los grupos
  en `group_members` de ese uid; un uid sin membresías no ve nada (RLS).
  La cola pendiente se pushea antes del cambio de sesión (no se pierde el grupo
  local recién creado).
- R3: `claim_group` re-asigna sólo si `created_by` coincide y no hay miembros con
  email; rechaza en caso contrario. Un grupo no reclamado queda sólo local y
  usable.
- Conflicto local/remoto: fila editada en dos lados → gana `updated_at` mayor
  (LWW), sin duplicar.

## Riesgos / decisiones abiertas

- **Cambiar de `uid` invalida el token anónimo viejo**: hay que pushear la cola
  ANTES. Si el usuario está offline al recuperar, se pospone el cambio de sesión
  hasta tener conexión (mensaje claro).
- **Un email por persona**: si alguien ya "guardó" su FIVI y en otro teléfono
  vuelve a "guardar" con el mismo email desde un anónimo distinto, Supabase lo
  rechaza. La UI debe ofrecer **"Recuperar"** en ese caso, no "Guardar".
- **Magic link en PWA instalada**: el link abre el navegador, no la PWA. Se
  maneja con `signInWithOtp` mostrando también el **código OTP de 6 dígitos**
  para pegar dentro de la app (Supabase lo soporta).
- No se implementa OAuth (Google/Apple) en esta iteración: email/OTP alcanza y
  es la vía más simple y compatible con la arquitectura actual.
