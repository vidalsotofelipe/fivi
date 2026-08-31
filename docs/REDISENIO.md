# Rediseño mobile-first + i18n (ES/EN)

Rediseño de la interfaz de FIVI siguiendo `CLAUDE_CODE_HANDOFF.md` (la spec
escrita es la fuente de verdad; los 3 PNG son referencia visual). **No cambia**
reglas de negocio, `domain/`, repos `data/`, motor `sync/`, backend ni auth: se
reusa todo lo existente (`queries.getGroupSummary`, `computeShares`,
`computeBalances`, `simplifyDebts`, `db-hooks`, repos).

## Qué incluye

- **Tokens de diseño** (`src/app/globals.css` + `tailwind.config.ts`): custom
  properties RGB (`--bg`, `--surface`, `--surface-raised`, `--border`, `--text`,
  `--text-muted`, `--accent`, `--danger`, `--warning`, …) mapeadas a Tailwind
  (`bg-bg`, `text-muted`, `border-border`, …). Paleta oscura del handoff con
  contrapartida clara; el tema sigue `prefers-color-scheme`.
- **Layout mobile-first**: `AppShell` (ancho fluido, tope 480 px,
  `padding-inline` fijo, sin ancho fijo, sin scroll horizontal a nivel
  documento), `AppBar` (volver + título + estado de sync + slot de menú),
  `BottomNav` (4 destinos: Resumen / Gastos / Personas / Más, labels visibles,
  `aria-current`, safe-area).
- **Componentes base** (`src/components/ui/`): `primitives` (Spinner, Skeleton,
  Card, Chip, StickyActionBar, StepIndicator, SegmentedControl), `overlays`
  (BottomSheet, ConfirmDialog), `toast`, `TextField`/`TextAreaField`,
  `formfields` (MoneyField, DateField, SelectField), `Combobox`, `cards`
  (BalanceCard, BalanceRow, TransferRow, ExpenseCard, PersonRow, ActivityItem).
  Touch target ≥ 44×44, estados `default/pressed/focus-visible/disabled/loading/
  error`, foco visible consistente (WCAG 2.2).
- **Flujos multi-paso**: alta de grupo (Grupo → Personas → Listo) y alta/edición
  de gasto (Detalle → División → Confirmar) con `StepIndicator`.
- **Estados transversales**: skeletons de estructura (`Loading`), `SyncBanner`
  (sin conexión / error del servidor con "Reintentar" / sin acceso al grupo),
  `SyncBadge` (punto + texto, nunca sólo color, live region), toasts de éxito
  con "Deshacer", confirmaciones destructivas con nombre + consecuencia.
- **i18n ES/EN** (`react-i18next` + `i18next`): español por defecto y fallback;
  cambio en caliente sin recarga; preferencia en `localStorage` (`fivi:lang`);
  sin preferencia guardada, sugerencia por `navigator.language`. Todos los
  textos visibles en `src/i18n/locales/{es,en}.json` (namespaces `common`,
  `nav`, `sync`, `errors`, `onboarding`, `group`, `expense`, `payment`,
  `people`, `activity`, `settings`, `a11y`), con interpolación (`{{var}}`) y
  pluralización (`_one`/`_other`) — sin concatenar fragmentos. Fechas / números
  / moneda con `Intl` y el locale de la UI; **la moneda del grupo no cambia con
  el idioma** (`src/lib/format.ts`: locale = UI, currency = grupo).

## Desviaciones respecto del handoff

Cada punto lista lo que pedía el handoff y qué se hizo en su lugar, con el
motivo.

### 1. Rutas: se mantienen `/g/[groupId]/…`

El handoff usa `/grupos/[id]/…`. Se conserva el esquema actual `/g/[groupId]/…`
para no romper el service worker (caché de rutas normalizada `/g/_/…`), los
enlaces `/join/<token>`, `ShareButton` ni los E2E. Sub-rutas nuevas dentro del
mismo esquema:

| Handoff | En FIVI |
|---|---|
| setup de personas | `/g/[groupId]/nuevo/personas` |
| "grupo listo" | `/g/[groupId]/listo` (se muestra una vez; flag `setup_seen:<id>` en `settings`) |
| personas | `/g/[groupId]/personas` y `/g/[groupId]/personas/[participantId]` |
| actividad | `/g/[groupId]/actividad` |
| menú "Más" | `/g/[groupId]/mas` (la config detallada sigue en `/g/[groupId]/config`) |

### 2. Sin identidad de participante — selector opcional "¿Quién sos?"

El handoff muestra "Vos — Lucía / Organizador". En FIVI los participantes son
**sólo nombres** (no hay cuentas ni roles de participante). Para poder mostrar
"Tu balance" y el filtro "Míos" se agrega un selector opcional **por
dispositivo** ("¿Quién sos en este grupo?", `settings` key `me:<groupId>`, no se
sincroniza). Sin setear: la pantalla de resumen cae a "Total gastado" + lista de
balances por persona, y el filtro "Míos" se oculta. Editable desde `Más`.

### 3. "Historial si el gasto fue editado" → sólo "Editado el {{date}}"

No hay tabla de historial de cambios. El detalle del gasto muestra
"Editado el {{date}}" cuando `version > 1` (equivalente: `updated_at !=
created_at`). La **actividad** deriva sus eventos (gasto creado/editado/
eliminado, pago registrado, persona agregada) de los `created_at` / `updated_at`
/ `deleted_at` y tombstones existentes (`queries.getGroupActivity`), sin schema
nuevo; "editado" indica que hubo una última edición y cuándo, no el diff.

### 4. Tema claro + oscuro (no sólo oscuro)

El handoff describe una identidad oscura. Se mantienen **ambos** temas: la
paleta oscura del handoff pasa a CSS vars con una contrapartida clara
(contraste ≥ 4.5:1) y se conserva `prefers-color-scheme`. La sección
"Apariencia" en `Más` es informativa (no hay override manual de tema).

### 5. "Ya tengo un grupo" oculto en el onboarding

No hay importación ni selección de grupo por ID desde el onboarding; sumarse a
un grupo existente es su propio flujo (`/join/<token>`). El CTA se omite.

### 6. Formato de moneda

El selector de moneda (`CurrencyPicker` → `Combobox`) localiza el **nombre** de
la moneda con `Intl.DisplayNames` (fallback al catálogo `domain/currencies`).
El aviso de "moneda bloqueada" en `/config` usa el nombre del catálogo (dato de
negocio), que puede quedar en español aunque la UI esté en inglés. El código y
el importe nunca cambian con el idioma.

## Verificación

- `npm run test` — unit (dominio + datos + sync + i18n). Incluye
  `getGroupActivity`, formato localizado, cambio/persistencia de idioma,
  fallback de clave faltante y **paridad de claves es/en**
  (`tests/i18n/parity.test.ts`).
- `npm run typecheck` · `npm run lint` · `npm run build`.
- `npm run test:e2e` (Playwright, `locale: es-AR`, sin Supabase):
  - `flow.spec.ts` — flujo completo con la UI nueva (alta en 3 pasos, wizard de
    gasto, saldos, pago, editar/borrar) + escritura local sin conexión.
  - `responsive.spec.ts` — sin scroll horizontal a nivel documento en
    **320 / 360 / 390 / 430 px** sobre las 11 rutas principales.
  - `idioma.spec.ts` — `Más → Configuración → Idioma → English` cambia la
    interfaz al instante, persiste tras recargar y no cambia la moneda.
