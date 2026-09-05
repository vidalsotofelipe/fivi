# Notificaciones push — diseño

> Estado: **implementado (v1)**. Avisa sólo al lado deudor (saldo negativo),
> por grupo y por dispositivo.

## Objetivo

Avisar a una persona, en un dispositivo puntual, cuando su saldo en un grupo
pasa a negativo (le corresponde pagar) — sin que tenga que abrir la app para
enterarse.

## Por qué no es una tabla más del motor de sync

`push_subscriptions` (migración `0020`) guarda el endpoint/claves de Web Push
de un dispositivo para un grupo, pero **no** es una entidad de
`groups`/`participants`/`expenses`/`payments`:

- Una suscripción push sólo tiene sentido con el dispositivo online — no hay
  "modo offline" para esto, así que no aporta nada meterla en `sync_queue`.
- Nadie más que el propio dispositivo necesita leer su fila; quien sí
  necesita leer TODAS las filas de un grupo (para mandarle el push a cada
  suscripto) es el propio backend, no otro cliente.

Por eso: RLS **default-deny** (mismo patrón que `feedback` en `0018`), y dos
rutas de servidor con `service_role` en vez de `RemotePort`/`SyncEngine`:

- `POST /api/notifications/subscribe` — el cliente manda su
  `Authorization: Bearer <access_token>` (la sesión anónima que ya tiene); la
  ruta verifica el JWT con `supabase.auth.getUser(token)` y saca el `uid` de
  ahí, **nunca** de un campo del body — así un dispositivo no puede escribir
  la suscripción de otro. Apagar el aviso (`enabled: false`) no manda la
  suscripción del navegador: sólo actualiza la fila que ya existe.
- `POST /api/notifications/send-debt` — recibe `{groupId}`, sin auth (como
  `/api/feedback`, con el mismo antispam liviano). Trae con `service_role`
  los datos del grupo, llama **directo** a `computeBalances` de
  `src/domain/balances.ts` (es pura, sin dependencias de browser/Dexie — se
  puede importar tal cual desde una Route Handler), y para cada suscripción
  con saldo negativo manda el push con `web-push`.

## Disparador

`SyncEngine.syncNow()` — justo después de que el push de la cola pendiente se
confirma sin error, y sólo si había algo pendiente (evita pegarle a la ruta
en cada poll de 20-30s sin razón). Se derivan los `group_id` afectados de los
items aceptados (`expense`/`payment` traen `group_id` directo;
`expense_participant` resuelve `expense_id → group_id` en Dexie) y se llama
`fetch("/api/notifications/send-debt", ...)` una vez por grupo, en un
try/catch que nunca puede romper el sync.

Quien sync-ea casi siempre es OTRO dispositivo que el destinatario del aviso
— es la persona que acaba de cargar el gasto/pago, no quien queda debiendo —
así que este es el momento correcto para chequear "¿alguien quedó debiendo?".

## De-duplicación

Cada suscripción guarda `last_notified_balance_minor`. Sólo se manda push si
el saldo actual es **más negativo** que ese valor (deuda nueva o más
grande); si mejoró o no cambió, se actualiza el valor guardado en silencio,
sin mandar nada — así no se repite el aviso en cada sync mientras la deuda
siga igual. Si no hay claves VAPID configuradas, o el envío falla por un
motivo transitorio, el valor guardado **no** se toca, para reintentar en el
próximo sync en vez de darlo por avisado sin haberlo logrado. Un 404/410 del
servicio de push (la suscripción ya no existe del lado del navegador) borra
la fila.

## Fuera de alcance v1

- Sin email, sólo push.
- Sin panel admin para ver/depurar suscripciones.
- Sólo el signo del saldo neto importa (no se recalcula "quién le debe a
  quién" server-side, sólo si el participante quedó en negativo).
- Sólo se avisa al deudor, nunca a quien le deben.
- Si alguien cambia "quién es" en el grupo después de activar el aviso, el
  toggle queda apuntando al participante viejo — hay que desactivar y volver
  a activar.
- El texto del push va siempre en español: el idioma de la interfaz es una
  preferencia local (`src/data/settings.ts`), no viaja al servidor.

## iOS

Web Push en Safari sólo funciona con la PWA **instalada** a la pantalla de
inicio (`display: standalone`, que `manifest.webmanifest` ya cumple) —
instalar es un paso manual del usuario, no automatizable. La UI lo detecta
(`needsIosInstall()` en `src/lib/push.ts`) y muestra un aviso en vez del
toggle cuando corresponde.

## Variables de entorno

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (servidor),
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` (cliente, mismo valor que la pública). Generar
con `npx web-push generate-vapid-keys`. Ver `.env.example`.

## Archivos

- `supabase/migrations/0020_push_subscriptions.sql`
- `src/app/api/notifications/subscribe/route.ts`
- `src/app/api/notifications/send-debt/route.ts`
- `src/sync/SyncEngine.ts` (`notifyAffectedGroups`)
- `src/lib/push.ts` (permiso + `pushManager.subscribe`)
- `src/components/NotificationsSection.tsx` (toggle, en Configuración del grupo)
- `public/sw.js` (listeners `push`/`notificationclick`)
