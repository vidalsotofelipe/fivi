# Changelog

Todas las novedades relevantes de FIVI. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y el proyecto usa
[Semantic Versioning](https://semver.org/lang/es/) en `0.x` (previo a la primera
versión estable: los cambios incompatibles suben MINOR, no MAJOR).

La versión de la app es la de `package.json`. Ver
[`docs/RELEASES.md`](docs/RELEASES.md) para el procedimiento de release y
rollback.

## [Unreleased]

_(sin cambios pendientes de release)_

## [0.17.3] - 2026-09-04

### Fixed

- **La tabla de Feedback del panel admin tenía las columnas desalineadas.**
  El encabezado tenía 5 celdas (Fecha, Tipo, Estado, Título, Estado — "Estado"
  quedaba dos veces: una por ser columna ordenable, otra fija al final) pero el
  cuerpo sólo tenía 4, así que a partir de la tercera columna el título quedaba
  debajo del encabezado "Estado" y el estado quedaba debajo de una celda vacía.
  Encabezado y celdas del cuerpo ahora tienen el mismo orden explícito (Fecha,
  Tipo, Título, Estado).

## [0.17.2] - 2026-09-04

### Fixed

- **El texto del botón "Saldar" no estaba centrado.** Tenía `min-h-touch`
  (altura mínima de 44px) pero le faltaba `items-center justify-center`, así
  que el texto quedaba pegado arriba en vez de centrado en esa altura.
- **No había forma de sumar a alguien a gastos anteriores a su ingreso**, salvo
  el instante en que se lo agrega (o desde Configuración → Participantes, un
  lugar poco intuitivo para esto). Si esa oferta automática se pasaba por alto
  o se elegía "Ahora no", no quedaba ningún camino evidente para retomarlo.
  Ahora el detalle de cada persona (`/personas/[id]`) tiene su propia sección
  "Gastos anteriores a su ingreso", con el mismo mecanismo ya existente
  (`AddToPastExpenses`): permite sumarla a algunos o todos los gastos de
  división equitativa que no la incluyen, en cualquier momento.

## [0.17.1] - 2026-09-04

### Added

- **Feedback de usuarios (Etapa 2 — panel admin).** Nueva sección "Feedback" en
  la navegación del panel, sobre la tabla que ya trajo `0.17.0`.
  - Listado con contadores (Total / Nuevos / Revisando / Planificados /
    Resueltos), filtros por estado, tipo y rango de fechas, y búsqueda por
    texto en título/descripción.
  - Detalle: tipo, título, descripción, contacto (si lo dejaron), el
    formulario extendido de "Encontré un problema" cuando aplica, la captura
    (si hay) mostrada con una signed URL de corta vida — nunca la ruta interna
    del bucket —, y un bloque de metadata técnica expandible (versión, entorno,
    idioma, tema, navegador, SO, dispositivo, viewport, página de origen,
    User-Agent aparte, al final).
  - Cambio de estado con un click (Nuevo/Revisando/Planificado/Resuelto de
    inmediato; Descartado pide confirmación), con auditoría en
    `admin_audit_log` igual que el resto de las acciones del panel.
  - Endpoints separados: `/api/feedback` (público, sólo crear) y
    `/api/admin/feedback/*` (listar/detalle/cambiar estado, protegidos por
    `requireAdmin` como el resto del panel — sin tocar su autenticación, que
    sigue siendo la llave compartida provisoria).

## [0.17.0] - 2026-09-04

### Added

- **Feedback de usuarios (Etapa 1 — app pública).** Nueva sección "Ayudanos a
  mejorar" en Ajustes generales, entre Apariencia y Apoyar el proyecto, con un
  botón que lleva a un formulario dedicado (`/ajustes/feedback`, no un modal:
  con varios campos y una imagen opcional, una pantalla normal se comporta
  mejor en mobile que un sheet que puede quedar más alto que el teclado).
  - Primero pregunta sobre qué se quiere escribir (🐞 problema / 💡 sugerencia /
    🙋 consulta / 💬 otro comentario). "Encontré un problema" agrega dos campos
    extra (qué se intentaba hacer, qué se esperaba que pasara) y relabela la
    descripción a "¿Qué ocurrió?".
  - Título, descripción y email de contacto (opcional, sin exigir cuenta) +
    captura de pantalla opcional (JPG/PNG/WEBP hasta 5 MB), con vista previa y
    opción de quitarla.
  - Se guarda automáticamente metadata técnica (versión de fivi, entorno,
    idioma, tema, navegador, sistema operativo, tipo de dispositivo, viewport,
    página de origen) — nunca datos del grupo (nombres, montos, alias, emails
    de terceros). La versión y el entorno los decide el servidor (no se
    confía en lo que declare el cliente); el resto de la metadata "no
    falsificable" (navegador/SO/dispositivo) se deriva del header
    `User-Agent`, no de JS del cliente.
  - La captura se sube a un bucket privado de Storage; nunca se expone por
    URL pública fija — el diseño reserva las signed URLs de corta vida para
    cuando el feedback se pueda revisar (etapa siguiente). El formato se
    valida por los bytes reales del archivo ("magic numbers"), no por el
    `Content-Type` declarado, que es trivial de falsificar.
  - Antispam liviano sin infraestructura nueva: máx. 5 envíos cada 10 minutos,
    por un id anónimo de dispositivo (si `localStorage` lo permite; nunca se
    crea uno para otra cosa) o, si no hay, por IP en memoria del proceso —
    la IP nunca se persiste.

### Changed

- **Base de datos:** nueva tabla `feedback` (migración `0018`), fuera del
  motor de sync offline-first (no tiene versión/cola: se crea una vez desde el
  endpoint público). RLS habilitada sin políticas, mismo patrón que
  `admin_audit_log`: sólo `service_role` puede tocarla, ningún usuario público
  puede listar ni leer feedback ajeno. La migración también deja preparadas
  (sin usar todavía) las funciones de agregación y el bucket privado
  `feedback-screenshots` que va a consumir el panel admin en la próxima
  entrega — no-opea sola en entornos sin el schema `storage` de Supabase, como
  el arnés de tests.

### Pendiente

- Gestión desde el panel admin (listado, filtros, detalle, cambio de estado):
  próxima entrega, sobre esta misma base de datos.

## [0.16.9] - 2026-09-04

### Fixed

- **"Volver" desde Ajustes generales mandaba siempre a la lista de grupos**, en
  vez de al grupo (o pantalla) del que viniste. `/ajustes` es alcanzable desde
  CUALQUIER pantalla (ícono global), así que un destino fijo estaba mal por
  definición: ahora usa el historial de navegación, igual que cualquier otra
  pantalla a la que se entra desde más de un lugar.

### Added

- **Marca "fivi" siempre presente en el nav superior**, junto a la flecha de
  volver (cuando la hay). Es la única navegación que garantiza llegar a la
  lista de grupos desde cualquier pantalla — a diferencia de "volver", que es
  contextual. En la pantalla de detalle de un gasto (la única con un menú
  propio ⋯) se muestra sólo el ícono, sin el texto, para no ahogar el título
  de la página a 320px.

## [0.16.8] - 2026-09-04

### Changed

- **El ícono de ajustes ahora está SIEMPRE presente**, en cualquier pantalla
  (antes sólo en el inicio): pasó del header de la pantalla de inicio al
  componente compartido de la barra superior (`AppBar`), así que aparece en
  todo lado sin que cada pantalla lo tenga que declarar — incluida, por
  ejemplo, la del detalle de un gasto, que convive sin problema con su propio
  menú contextual (editar/duplicar/borrar). Su nombre accesible es "Ajustes
  generales" (no "Ajustes"): la Configuración de un grupo también se llama
  "Ajustes"/"Settings" en algunas pantallas, y un nombre corto colisionaba con
  ese link.
- **El botón de apoyo (Cafecito) también está en Ajustes generales**, no sólo
  en el menú "Más" de cada grupo: es contenido de nivel app, no de un grupo en
  particular. Se extrajo a un componente compartido (`CafecitoSupport`) para no
  duplicar el markup entre las dos pantallas.

## [0.16.7] - 2026-09-04

### Added

- **Menú general de la app desde el inicio.** Ícono ⚙ arriba a la derecha en la
  pantalla de todos los grupos, con o sin grupos creados, que lleva a
  `/ajustes`. Antes Idioma y Apariencia —preferencias del dispositivo, no de un
  grupo— sólo se podían cambiar entrando a un grupo y abriendo su
  Configuración. "¿Cómo te llamás?" y "Moneda principal" siguen en el inicio,
  donde ya eran accesibles sin entrar a un grupo.

## [0.16.6] - 2026-09-04

### Added

- **Botón de apoyo (Cafecito) en "Más".** Aporte voluntario y opcional para
  sostener el desarrollo de fivi, con un enlace a `cafecito.app` en una pestaña
  nueva. No es una función paga ni algo necesario para usar la app.

### Fixed

- **Sumarse por invitación como "persona nueva" no preguntaba por los gastos
  anteriores.** Al entrar por invitación y elegir "no estoy en la lista" en
  `MePicker`, el participante se creaba y el panel se cerraba de una, sin
  ofrecer sumarlo a los gastos de división equitativa ya registrados (algo que
  sí pasaba al agregar a alguien desde Personas). Ahora `MePicker` reusa
  `AddToPastExpenses` como paso intermedio antes de cerrar: si hay algo que
  ofrecer, pregunta y aplica el reparto elegido (o "Ahora no"); si no hay nada,
  se cierra solo como antes. Elegir un nombre que ya está en la lista sigue
  cerrando de inmediato, sin este paso.

## [0.16.5] - 2026-09-04

### Fixed

- **Un gasto podía guardarse cien veces más grande de lo escrito.** Con la app
  en español y un grupo en dólares, escribir `10,50` guardaba **US$ 1.050,00**.
  El separador decimal salía del locale de la **moneda** (USD → `en-US`, donde
  la coma separa miles) en vez del idioma de quien escribe. Ahora el parseo
  depende del **idioma de la interfaz**: en español `10,50` son diez con
  cincuenta en ARS, USD, EUR, GTQ o cualquier moneda de dos decimales; en inglés
  eso mismo se escribe `10.50`. Los dos separadores se aceptan sólo con reglas
  sin ambigüedad: si aparecen los dos, el último es el decimal; uno repetido son
  miles; uno solo con tres dígitos detrás (`1.234`) es el único caso realmente
  ambiguo y ahí decide el idioma. Todo se sigue guardando en unidades mínimas
  enteras.
- **El Service Worker podía guardar respuestas del panel administrativo.** Todo
  GET que no fuera documento ni asset entraba en stale-while-revalidate, así que
  `/api/admin/**` podía quedar en Cache Storage: datos administrativos servidos
  después de cerrar sesión, o un 401 cacheado devuelto ya con la sesión
  iniciada. Ahora el cache es una **allowlist**: sólo assets públicos, el
  manifest y `/api/rates`. `/api/admin/**` y `/administracion/**` no se
  interceptan siquiera, no se cachea ningún pedido con `Authorization`, ni
  ninguna respuesta que no sea `ok` o que venga con `no-store`/`private`. Todas
  las respuestas administrativas mandan `Cache-Control: private, no-store` y
  `Vary: Authorization`. Versión del SW a **v10**: al activarse borra los caches
  anteriores, incluido lo que hubiera quedado guardado.
- **"Por porcentaje" funcionaba como "por partes".** 60 % + 50 % se aceptaba y
  se repartía 60/110 y 50/110 —un reparto que nadie pidió—, con el botón de
  guardar habilitado. `percent` y `shares` compartían implementación. Ahora los
  porcentajes **deben sumar 100 %** (con margen para decimales: 33,33 + 33,33 +
  33,34 entra), "por partes" conserva el comportamiento proporcional, y el error
  dice exactamente qué pasa: "Los porcentajes deben sumar 100 %. Actualmente
  suman 110 %".
- **El idioma quedaba desincronizado con el navegador en inglés.** Los textos y
  `<html lang>` salían en inglés, pero el selector marcaba "Español" y las
  fechas, los tiempos relativos y los nombres de moneda aparecían en español
  dentro de frases inglesas. `LocaleProvider` llamaba a `changeLanguage` **antes**
  de registrar el listener `languageChanged`: con los recursos embebidos el
  evento se emite en el acto y se perdía. Ahora el listener va primero y el
  idioma inicial además se aplica explícitamente.
- **El botón de guardar quedaba habilitado con un reparto inválido.** Ahora se
  deshabilita mientras el reparto no cierre, el error se limpia al cambiar de
  modo, estrategia o participantes, y no se muestra duplicado arriba y abajo.
- **Los errores de reparto mostraban unidades mínimas internas** ("asignado
  12000, total 10000"). Ahora van formateados en la moneda del grupo y el idioma
  de la interfaz ("suman $ 120,00 y el gasto es $ 100,00"), y "La suma de los
  pesos debe ser mayor que cero" se reemplazó por mensajes propios de cada modo.
- **"Gastos anteriores" no hacía nada** cuando la persona ya estaba en todos los
  gastos. Ahora lo dice: "No hay gastos anteriores donde sumar a Ana".

### Added

- **Cotización oficial del dólar del Banco de la Nación Argentina para ARS.** Es
  la primera fuente oficial por moneda: el resto sigue con la referencia de
  mercado, y cada moneda muestra la suya en el detalle de conversión ("ARS —
  Banco de la Nación Argentina (oficial), cotización del 3 de sept de 2026"). El
  BNA publica compra y venta; se usa el **punto medio**, porque un saldo puede
  ser a favor o en contra y tomar una punta inclinaría la estimación según el
  signo. El total consolidado sólo se llama "oficial" si **todas** las
  conversiones lo son.
  - El BNA no tiene API: se parsea su tabla HTML, y el parser **falla cerrado**.
    Busca la fila por su etiqueta (nunca por posición), descarta las filas
    marcadas `(*)` (cotizan cada 100 unidades) y valida los números antes de
    creerles. Ante cualquier problema —red, timeout, HTML distinto, números que
    no cierran— devuelve `null`, ARS vuelve sola a la referencia de mercado y la
    interfaz lo dice. Nunca se inventa una cotización.
  - Sumar otra moneda oficial es agregar un override en
    `src/lib/exchangeRates.ts`; nada más cambia. Ver
    [`docs/FX_SOURCES.md`](docs/FX_SOURCES.md).

### Changed

- **Los errores de reparto son códigos tipados en el dominio** (`SplitError`), y
  la UI los traduce. `splitStrategyLabel` (que devolvía texto en español) pasó a
  ser `splitStrategyKey`, que devuelve una clave i18n.
- **Los gastos con división a medida ya no se omiten** al sumar a alguien a
  gastos anteriores. Se listan en su propia sección, sin poder tildarlos,
  explicando que hay que asignarle a mano su monto o porcentaje, con acceso
  directo a editar el gasto.
- **La conversión de monedas ya no se presenta como oficial cuando no lo es.**
  `open.er-api.com` es una referencia de mercado, no un banco central: cada
  moneda muestra su fuente, su fecha y su condición ("fuente alternativa, no
  oficial"), con la aclaración de que los importes originales no cambian. El
  relevamiento de qué fuente oficial cubre cada una de las 35 monedas quedó en
  [`docs/FX_SOURCES.md`](docs/FX_SOURCES.md); ARS ya usa la del BNA (ver
  "Added"), el resto sigue pendiente y planificado ahí.
- **Límites de longitud visibles y en el servidor** para nombre de grupo (60),
  descripción de grupo (120), descripción de gasto (120) y nombre de participante
  (60). Con contador en la interfaz, validación en los repos y `check` en
  Postgres (migración `0016`).
- Áreas táctiles de "De dónde sale la conversión", "Editar" y "Ver todo" llevadas
  al mínimo de 44 px de alto.
- Al enviar el alta de grupo con el nombre vacío o demasiado largo, el foco ahora
  **se mueve al campo** además de marcarlo con `aria-invalid`.

### Tests

- Parseo de montos: español + USD + `10,50` → 1050; español + ARS + `1.234,56` →
  123456; inglés + ARS/USD + `10.50` → 1050; monedas sin decimales (CLP, JPY,
  PYG, KRW); ida y vuelta `minorToRawInput` ↔ `toMinorUnits` en los dos idiomas.
- Porcentajes: 50+50 válido; 33,33+33,33+33,34 válido y con suma monetaria
  exacta; 60+50, 40+40, 0+0 y negativos inválidos, cada uno con su código.
- **E2E con Service Worker activo** (`sw-admin.spec.ts`): pedido administrativo
  autorizado → 200, se quita la autorización → 401, y Cache Storage no contiene
  ninguna URL `/api/admin/**` ni `/administracion/**`. El resto de los E2E sigue
  corriendo con el registro automático apagado; este test lo registra a mano.
- E2E de montos por idioma, incluido el caso exacto del reporte, la edición, el
  pago parcial y los mensajes de reparto formateados en pesos.
- E2E con el navegador en `en-US` y sin preferencia guardada: interfaz,
  `<html lang>`, pestaña "English" seleccionada, fechas y monedas en inglés, y
  persistencia tras recargar.
- E2E de gastos anteriores: sumar a alguien a un gasto equitativo, el aviso
  cuando no hay ninguno, y el listado aparte de los gastos a medida con su
  acceso a edición. También "quién sos en este grupo" y "sumarme al grupo".
- RLS: los límites de longitud de la migración `0016`.
- Parser del BNA contra el marcado real capturado: punto medio, búsqueda por
  etiqueta, exclusión de las filas `(*)`, los dos formatos numéricos posibles, y
  un caso por cada modo de falla (sin tabla, sin fila, celdas no numéricas, venta
  menor que compra, spread absurdo, ceros) — todos devuelven `null`.
- Atribución de fuentes: ARS al BNA y el resto al proveedor base; el consolidado
  no es "oficial" si alguna conversión es de mercado; una moneda sin cotización
  no se convierte ni aporta fuente.

## [0.16.4] - 2026-09-04

### Fixed

- **Gastos que nunca terminaban de sincronizar ("N sin sincronizar" que sólo
  crecía).** Causa raíz, confirmada contra producción: al **editar un gasto** o
  al **sumar a alguien a gastos anteriores**, la app borraba lógicamente las
  porciones viejas y creaba filas nuevas con otro `id` pero **el mismo par
  `(gasto, persona)`**. La restricción de unicidad del servidor no distinguía
  las filas borradas, así que el envío chocaba con un 409, reintentaba 5 veces
  y quedaba trabado para siempre. Peor: en el servidor quedaban gastos con
  porciones **incompletas o sin ninguna** (se encontraron dos casos reales, uno
  con 0 porciones vivas sobre un total de 20.000,00 y otro con 1 de 3).
  - Ahora `replaceExpense` **reutiliza la fila de cada persona** (actualiza el
    importe en lugar de borrar y crear), así que ese par duplicado ya no se
    genera.
  - Migración `0015`: la unicidad de `(gasto, persona)` pasa a ser un índice
    **parcial sobre las filas vivas** (`where deleted_at is null`). Esto además
    **destraba a los dispositivos que ya estaban colgados**: su próximo
    reintento entra bien y la cola se vacía sola.

### Changed

- **La moneda se propone según el lugar desde donde te conectás.** El país
  detectado ahora **decide**: si te conectás desde Perú, el grupo arranca en
  PEN aunque el teléfono esté en inglés o hayas usado otra moneda antes. Si el
  país no tiene una moneda que la app maneje, arranca en **USD** y se avisa.
  Sin país (offline o falla la detección) se mantiene el orden de siempre:
  última moneda elegida → región del navegador → USD.
- **Catálogo de monedas de 10 a 35**, con toda América Latina (ARS, BOB, BRL,
  CLP, COP, CRC, DOP, GTQ, HNL, MXN, NIO, PEN, PYG, UYU, VES) más los mercados
  principales. El mapa país→moneda cubre la zona euro completa y los países
  dolarizados (EC, SV, PA, …).

### Tests

- Regresión del bug de sincronización: `replaceExpense` reusa ids y nunca deja
  pares duplicados; sacar y volver a sumar a alguien revive **la misma fila**.
  En RLS, la unicidad parcial de `0015` sobre filas vivas.
- **Mismos nombres en grupos distintos** (11 casos): cada grupo tiene su propio
  participante aunque el nombre se repita, los saldos no se mezclan, quitar a
  alguien de un grupo no lo toca en el otro, y el reconocimiento de "quién sos"
  funciona por grupo (incluso con dos homónimos en el mismo grupo).
- Detección de moneda por país reescrita: el país gana sobre el idioma y sobre
  la última elección; país sin moneda soportada → USD.

## [0.16.3] - 2026-09-04

### Fixed

- **"Quién le debe a quién" mostraba "—" en vez de nombres.** Quitar a alguien
  del grupo es un borrado lógico: sus gastos y pagos **siguen contando en los
  saldos** (así lo dice la confirmación), pero la lista de participantes que
  usaba la UI sólo traía a los que siguen en el grupo, así que esas filas
  quedaban como "— le debe $X a —". Ahora el nombre se resuelve contra **todos**
  los que alguna vez estuvieron en el grupo, en saldos, "quién le debe a quién",
  actividad, lista y detalle de gastos.
  - Para **elegir** personas (checkboxes del gasto, selectores, "quién sos") se
    sigue usando sólo la lista viva.
  - "Saldar" una deuda con alguien que ya no está ahora funciona: el selector de
    receptor lo incluye cuando viene preseleccionado (antes quedaba vacío).

## [0.16.2] - 2026-09-03

Más ajustes de UX y offline. Sin cambios de esquema.

### Changed

- **Alta de gasto en 2 pasos** (antes 3). El segundo paso —"División"— es ahora
  la confirmación: muestra **cuánto le corresponde a cada persona** y desde ahí
  se **guarda directo**, sin la tercera pantalla de "Revisar". Un clic menos.
- **Offline de punta a punta.** El Service Worker (v9) precachea en `install`
  **todos los assets del build** (chunks JS, CSS; lista en `public/precache.json`
  generada al buildear) y los "shells" normalizados `/g/_` y `/join/_`. Así
  cualquier ruta —incluido un grupo que nunca se abrió en este dispositivo—
  carga sin conexión; los datos de cada grupo ya viven en IndexedDB.
- **"Agregar persona": campo y botón a la misma altura.** El botón "Agregar"
  quedaba más bajo que el input; ahora se estiran juntos (`AddPersonRow`).

### Fixed

- En el alta del grupo, la lista de participantes vacía mostraba **"Ej.: Ana"**
  como si fuera una entrada (la gente lo tocaba). Ahora dice "Todavía no
  agregaste a nadie." y "Ej.: Ana" queda sólo como placeholder del campo.

## [0.16.1] - 2026-09-03

Ajustes de UX a partir de feedback. Sin cambios de esquema.

### Fixed

- **"Tu grupo está listo" sin botones.** Los CTA ("Agregar primer gasto" / "Ir
  al resumen") iban con `mt-auto` al borde inferior y en algunos teléfonos
  quedaban fuera de vista o bajo la barra del navegador. Ahora van en el flujo,
  justo debajo de la tarjeta del grupo, siempre visibles.
- **El toast tapaba botones.** `StickyActionBar` publica su alto real en
  `--fivi-bottomnav` (la variable que el toast ya usaba para no tapar el menú
  inferior), así el toast también se levanta por encima de las barras de acción
  fijas (alta de gasto, registrar pago, crear grupo). El toast de "gasto/pago
  guardado" pasa de **10 s a 5 s** (la ventana de "Deshacer" sigue siendo
  suficiente).

### Changed

- **Al entrar por invitación** ya no se cae directo en los gastos: el resumen
  del grupo abre primero **"¿Quién sos en este grupo?"**, donde se puede elegir
  un participante existente o **sumarse como integrante** (con el nombre, que
  también queda como preferencia para los próximos grupos).
- **Logo en la barra superior**: en las pantallas sin botón de volver (inicio,
  onboarding, "grupo listo", invitación) aparece la marca de fivi a la
  izquierda del título.

## [0.16.0] - 2026-09-03

**Moneda principal / balance global** y **paleta v2** (claro + oscuro). Incluye
las correcciones de admin de 0.15.3 y 0.15.4. **Requiere la migración
`0014_exchange_rates.sql`** (aditiva: tabla de cache de cotizaciones; sin ella
el balance global sigue funcionando, sólo pierde el cache tibio compartido).

### Added

- **Moneda principal del usuario.** En el inicio se puede elegir una moneda para
  ver la situación **consolidada** de todos los grupos. **No cambia la moneda de
  ningún grupo ni gasto**: los importes originales siguen siendo la fuente de
  verdad. Se sugiere una según la región (misma lógica que al crear un grupo) y
  el usuario siempre puede cambiarla. Preferencia por dispositivo.
- **Balance global estimado** en el inicio: convierte el saldo **neto de cada
  moneda por separado** a la moneda principal y los suma —nunca suma monedas
  distintas sin convertir—, con las monedas sin cotización listadas aparte.
  Debajo, siempre, el detalle **por moneda** con los importes originales.
- **Conversión de divisas** vía `ExchangeRateService` (`src/lib/exchangeRates.ts`)
  + endpoint `/api/rates`. Fuente: **open.er-api.com** (ExchangeRate-API abierto:
  sin API key, ~160 monedas incluidas ARS/GTQ/CLP/UYU/BRL/MXN, actualización
  diaria, cita la fecha). Se evaluó ECB/Frankfurter pero no cubre ARS/GTQ/CLP.
  La fuente está abstraída: cambiarla es tocar un archivo. Cache en tres niveles
  (memoria del proceso · tabla `exchange_rates` en Supabase · IndexedDB en el
  cliente, TTL 6 h). Si el proveedor falla se usa la última cotización válida,
  marcada como estimada con su fecha; **nunca se ocultan los importes
  originales** ni se bloquea nada.
- **Código ISO en pantallas multi-moneda.** Donde conviven varias monedas
  (dashboard, tarjetas con conversión) se muestra `ARS 25.000` / `USD 80` en vez
  de `$ 25.000` (ambiguo). Dentro de un grupo, con una sola moneda, se conserva
  el símbolo.
- Las tarjetas de grupo muestran el importe **en la moneda del grupo** como
  principal y, si la moneda principal es otra, `≈ ARS …` como dato secundario
  debajo (nunca se invierte la jerarquía).

### Changed

- **Paleta de color v2**, claro y oscuro: "verde botella y crema" (claro),
  "grafito y sepia" (oscuro). Acento verde botella / azul-gris frío, cálido
  terracota/sepia, y **el punto de "Sincronizado" ahora es verde** (color
  propio para "OK", ya no el acento). `<meta theme-color>` y el manifest
  actualizados a los nuevos fondos.

## [0.15.4] - 2026-09-03

### Fixed

- **Guardar configuración con la llave de acceso daba error 500.**
  `admin_settings_set` y `admin_set_user_admin` reciben `p_by uuid`, pero con la
  llave compartida la identidad es el texto sintético `"access-key"` → Postgres
  fallaba al castear a uuid. Ahora los endpoints pasan `null` en ese caso
  (`AdminCtx.adminUserId`), consistente con la auditoría. Afectaba a Configuración
  (moneda, zona horaria, feature flags) y a conceder/quitar admin.

## [0.15.3] - 2026-09-03

Corrección integral del panel de administración a partir de una revisión QA en
producción. Sin cambios de esquema ni migraciones nuevas (`0013_created_by.sql`
sigue siendo requisito). La configuración de zona horaria se guarda con la
infraestructura de `admin_settings` ya existente.

### Changed

- **Ruta canónica del panel: `/administracion`.** `/admin` (y `/admin/*`)
  redirige a `/administracion` conservando la query (`?k=…`). Los endpoints
  siguen en `/api/admin/*`, cada uno protegido por `requireAdmin`. La entrada
  nunca figura en la navegación de la app.
- **Zona horaria consistente.** Todas las fechas del panel (Dashboard, Usuarios,
  Grupos, Movimientos, Auditoría, Estado) se muestran en
  `America/Argentina/Buenos_Aires` por defecto —no en la zona del navegador de
  quien mira, que hacía ver `03:15Z` como "8:15 p. m." (UTC-7)—. Configurable en
  Configuración → Zona horaria (identificador IANA). Los datos se siguen
  guardando en UTC.
- **Idioma y formatos unificados.** El entorno se muestra como "Producción" /
  "Vista previa" / "Desarrollo" (no `production`); el rol de grupo como
  "Creador" / "Miembro" (no `owner`). Los contenedores del panel declaran
  `lang="es-AR"` para que los selectores de fecha nativos usen `dd/mm/aaaa`.
- **Dashboard: tarjeta de altas.** "Nuevos 7 días" con aclaración "17 en 30
  días" pasa a "Altas de usuarios (7 días)" + "N en los últimos 30 días".
- **Detalle de Grupo / Usuario: carga con estructura.** Skeleton que reproduce
  la disposición real (cabecera, grilla, tarjetas, lista) con
  `role="status"` + `aria-live` y texto "Cargando grupo…" / "Cargando usuario…".
  Si la consulta falla, estado de error con "Reintentar" (ya existía).

### Fixed

- **Rango de fechas inválido.** En Movimientos y Auditoría, con "Desde" posterior
  a "Hasta" el filtro se ignoraba y volvían todos los resultados. Ahora se
  muestra "La fecha desde no puede ser posterior a la fecha hasta" y **no se
  ejecuta la consulta** hasta corregirlo (validado también en el backend: 400).
- **Columnas de Usuarios desalineadas.** Los `th` decían "Alta · Último acceso ·
  Email" y las celdas iban email, alta, último acceso. Encabezados y celdas
  ahora recorren una única definición de columnas en el orden pedido: **Email ·
  Alta · Último acceso · Estado · Grupos · ID**. `th` con `scope`, primera celda
  de cada fila como `th scope="row"`.
- **Moneda por defecto sin validar.** El campo aceptaba cualquier combinación de
  3 letras (`ABC`). Ahora es un selector de monedas soportadas y el backend
  valida contra ISO 4217 (incluye ARS, USD, EUR, GTQ); no se guardan códigos
  inexistentes.
- **Configuración: "Guardar flags" siempre habilitado.** Se deshabilita salvo
  que haya un cambio real en los flags. El campo para agregar un flag tiene
  etiqueta accesible ("Nombre del nuevo feature flag"), explica el formato
  permitido y valida el nombre (colisiones y caracteres) antes de agregar.

### Accessibility

- Skeletons y estados de carga anuncian `role="status"` / `aria-live`.
- `th`/`td` de las tablas asociados con `scope`.
- Login del panel: foco visible y navegable por teclado; sin desborde horizontal
  a 320 / 375 / 768 / 1024 / 1440 px (test e2e).

## [0.15.2] - 2026-09-02

Corrección del modo sin conexión. Sin cambios de esquema ni migraciones (la de
0.15.1, `0013_created_by.sql`, sigue siendo requisito).

### Fixed

- **Abrir un grupo sin conexión se quedaba cargando para siempre.** Un grupo que
  todavía no estaba en el dispositivo (abierto por enlace, o con los datos
  locales borrados) dejaba `/g/<id>` girando indefinidamente porque el estado
  "hidratando" del primer pull no se soltaba nunca offline. Ahora:
  - sin conexión, el motor deja de marcar esos grupos como "hidratando" —
    `trackedGroupIds` los conserva y el próximo pull al reconectar los trae;
  - la espera del primer pull tiene tope (8 s): si no llega, se muestra el aviso
    en vez del spinner;
  - el aviso distingue el caso offline: "Estás sin conexión y este grupo todavía
    no está en este dispositivo. Se va a abrir solo cuando vuelvas a tener
    internet."
  - Un grupo que **sí** está en el dispositivo se abre siempre, con o sin
    conexión (no cambió).

## [0.15.1] - 2026-09-02

Correcciones detectadas en una prueba funcional general. **Requiere la migración
`0013_created_by.sql`** (aditiva y backward-compatible: agrega una columna
anulable `created_by` a `expenses` y `payments`). Sin ella el push de gastos y
pagos nuevos falla al no existir la columna en el servidor, así que hay que
aplicarla **antes** de desplegar.

### Added

- **Autoría real de los movimientos.** Nueva columna `created_by`: el gasto/pago
  guarda quién lo **registró** (el "vos" del dispositivo), aparte de `paid_by`
  (quién **pagó**). La actividad ahora muestra como autor a quien creó el
  movimiento; si Usuario QA carga un gasto que pagó Ana, dice "Usuario QA agregó
  el gasto", no "Ana". Los movimientos anteriores no tienen `created_by` y
  siguen mostrando a quien pagó, como antes.

### Changed

- **Preselección sensata de personas.**
  - Al **agregar un gasto**, "Pagó" arranca en vos (tu "yo" en el grupo); si ya
    cargaste gastos antes, se respeta ese último pagador. Recién si no hay
    ninguno de los dos, cae en el primer participante.
  - Al **registrar un pago** manual (sin venir de "Saldar"), ya no se
    preseleccionan personas al azar (adiós al "Ana → Bruno" arbitrario): se
    propone que pagás vos y que le pagás a quien le debés según los saldos. Si
    no hay una deuda tuya aplicable, no se asume ningún par. Los accesos
    **"Saldar"** siguen completando pagador, receptor y monto igual que antes.
- **Idioma inicial determinista.** i18next arranca siempre en español (el idioma
  del SSR) y `LocaleProvider` aplica la preferencia/idioma del navegador en un
  efecto post-montaje. El primer render del cliente coincide con el HTML del
  servidor: se termina el error de hidratación React #418 y el parpadeo de
  idioma en la primera visita en inglés.
- **Textos centralizados en las traducciones.** "Split · Partes iguales" (la
  estrategia de división estaba fija en español) y "Sos owner" ahora salen del
  sistema i18n y respetan el idioma activo.
- **Vacíos de la lista de gastos por filtro.** Con "Míos" o "Este mes" activos y
  sin resultados ya no dice "no encontramos gastos con esa búsqueda" si el
  buscador está vacío: muestra un mensaje propio del filtro. El botón limpia
  **sólo el texto** cuando sólo hay búsqueda ("Limpiar búsqueda"); si hay un
  filtro activo, pasa a "Restablecer filtros" y limpia todo.
- **Reparto con redondeo.** En divisiones no exactas la línea "por persona" se
  muestra como aproximada ("≈ … por persona · el centavo restante se ajusta
  automáticamente") en vez de afirmar un monto único.

### Fixed

- **Rutas de grupo mal formadas.** `/g/grupo-inexistente` (id que no es un UUID)
  mostraba un error interno de PostgreSQL (`invalid input syntax for type uuid`)
  y quedaba reintentando. Ahora se valida el UUID antes de consultar la base o
  pedir el grupo al servidor y se muestra directamente "No pudimos abrir este
  grupo", sin consultas ni ciclos de reintento.
- **Vista previa de saldos en pagos inválidos.** Un pago parcial que supera la
  deuda ya no muestra el "saldo resultante" con balances imposibles: la vista
  previa se oculta hasta que el monto sea válido.
- **Notificaciones sobre el menú inferior.** El toast usa un fallback de alto de
  menú (4rem) hasta conocer el real, así nunca aparece tapando la barra de
  navegación ni intercepta sus botones; respeta `env(safe-area-inset-bottom)` y
  conserva "Deshacer", "Ver gasto" y "Cerrar".

### Accessibility

- Los checkboxes de participantes anuncian a quién incluyen ("Incluir a Ana").
- Los campos de reparto personalizado tienen nombre accesible ("Monto de Ana",
  "Porcentaje de Bruno", "Partes de Usuario QA").
- Los botones de eliminar persona vuelven a 44×44 px de área táctil (estaban en
  36×36).

## [0.15.0] - 2026-09-02

Resumen de todos los grupos en el inicio e identidad única del usuario. Sin
cambios de esquema. Sin migraciones.

### Added

- **Resumen de todos tus grupos** en la pantalla de inicio: cuánto te deben,
  cuánto debés y cuántos grupos activos hay, con la cifra principal destacada.
  **Los totales se agregan por moneda, nunca entre monedas**: un grupo tiene una
  sola moneda y FIVI no convierte divisas, así que sumar 300 € con 60 £ daría un
  número falso. Con una sola moneda (el caso normal) se ve como un total único;
  con varias, una línea por moneda. Los grupos donde todavía no indicaste quién
  sos no entran en el total y se avisa cuántos son.
- **Tu nombre, una sola vez para todos los grupos.** Nueva preferencia `my_name`:
  al indicarlo, FIVI te suma solo como participante en los grupos que creás (y te
  marca como "vos"), y te reconoce en los que ya existen —invitaciones, otro
  dispositivo— cuando hay un participante con ese nombre. La comparación ignora
  acentos, mayúsculas y espacios de más, y nunca duplica un participante ni pisa
  una elección previa. Sigue siendo local al dispositivo: los participantes son
  nombres, no cuentas.

### Changed

- **Tarjetas de grupo rediseñadas**: avatar con iniciales (color estable por
  grupo), nombre, subtítulo con personas · gastos · cambios sin sincronizar, y a
  la derecha tu saldo con su etiqueta ("te deben" / "debés" / "estás al día").

## [0.14.3] - 2026-09-02

Activación del panel de administración. **Requiere la migración
`0012_admin_auth_access.sql`** (aditiva, ya aplicada en producción).

### Fixed

- **El panel no podía ver usuarios ni métricas.** `service_role` tiene `USAGE`
  sobre el esquema `auth` pero **no `SELECT` sobre `auth.users`**, y las
  funciones de 0011 eran `SECURITY INVOKER`: al llamarlas por PostgREST fallaban
  justo las que leen usuarios (`/api/admin/users` → 500, `/api/admin/metrics` →
  vacío), mientras grupos, movimientos y auditoría sí funcionaban. La migración
  `0012` pasa a `SECURITY DEFINER` las cuatro funciones que tocan `auth.users`
  (`admin_dashboard`, `admin_list_users`, `admin_get_user`,
  `admin_set_user_ban`) con `search_path` fijo. Sigue sin poder ejecutarlas
  nadie más que `service_role`.
- **El chequeo "Supabase Auth" de `/admin/estado` daba siempre error.**
  `/auth/v1/health` exige el header `apikey`; sin él responde 401. Era un falso
  negativo del propio diagnóstico.

## [0.14.2] - 2026-09-01

Estado de sincronización coherente y reintento que funciona de verdad. Sin
cambios de esquema. Sin migraciones.

### Fixed

- **La pantalla se contradecía a sí misma.** En el resumen de un grupo podía
  verse "19 sin sincronizar" en la barra, "No se pudo guardar en el servidor"
  en el banner y "Sincronizado recién" en el cuerpo, todo a la vez. Eran tres
  componentes decidiendo por su cuenta sobre el mismo estado. Ahora la decisión
  vive en una sola función pura (`src/sync/statusKind.ts`) que usan el badge, el
  banner y la línea del resumen: no pueden discrepar. La marca de tiempo
  ("sincronizado hace X") sólo aparece cuando **todo** está al día; si hay algo
  pendiente o con error, el badge y el banner ya lo informan.
- **`last_synced_at` avanzaba con cambios rechazados.** Cuando el servidor
  rechaza filas una por una el push no lanza excepción, así que la corrida
  llegaba al camino feliz y marcaba la hora igual. Ahora sólo se actualiza si no
  hubo ningún rechazo.
- **El botón "Reintentar sincronización" no hacía nada.** `getPendingItems`
  descarta los items que agotaron `MAX_ATTEMPTS` incluso al forzar, así que el
  reintento no los alcanzaba — justo en el caso en el que se muestra el botón.
  Nuevo `resetExhausted` + `SyncEngine.retryFailed()`: el reintento del usuario
  devuelve esos cambios a la cola con los intentos en cero. También se dispara
  al iniciar **una sesión nueva** (`SIGNED_IN`), que es cuando los rechazos
  causados por una sesión inválida merecen otra oportunidad.

## [0.14.1] - 2026-09-01

### Added

- **Acceso provisorio al panel con llave compartida.** Si existe la variable
  server-only `ADMIN_ACCESS_KEY`, un bearer token igual a esa llave habilita
  `/api/admin/*` sin necesidad de crear usuarios. Se entra una vez por
  `/admin/login?k=<LLAVE>` (se guarda en el navegador y se limpia la URL) o
  pegándola en el campo "Llave de acceso". Es un **secreto compartido, no una
  identidad**: en auditoría queda `admin_user_id = null` y
  `metadata.auth = "access-key"`, y el topbar muestra el distintivo "llave".
  El camino de Supabase Auth (`app_admins`) queda intacto para la etapa 2:
  se vuelve a él quitando la variable.

### Changed

- **Alta de gasto**: los atajos de "Gastos frecuentes" pasan **debajo** del
  campo Descripción — funcionan como sugerencias para completarlo, no como un
  paso previo.

### Fixed

- **Campo de fecha desbordando el layout en iOS Safari.** `input[type="date"]`
  trae ancho intrínseco propio y centra el valor, así que se salía del
  contenedor y descolocaba la pantalla. Ahora se normaliza (`appearance: none`,
  `max-width: 100%`, valor alineado a la izquierda vía
  `::-webkit-date-and-time-value`): mismo ancho que el resto de los campos. El
  selector nativo sigue funcionando igual.

## [0.14.0] - 2026-09-01

Panel de administración `/admin`. **Requiere aplicar las migraciones
`0010_admin.sql` + `0011_admin_functions.sql`** (aditivas, ya aplicadas en el
proyecto de producción) y la variable server-only **`SUPABASE_SERVICE_ROLE_KEY`**
(sin ella `/api/admin/*` responde 503 y el panel muestra "no disponible"; la app
principal no se ve afectada). Ver `docs/ADMIN.md`.

### Added

- **`/admin`**: sección privada con login propio por email + contraseña (cliente
  Supabase con `storageKey` separado; la app principal sigue 100% anónima).
  Dashboard con datos reales (KPIs + comparativo + gráfico), Usuarios (tabla
  paginada, detalle, activar/desactivar, conceder/quitar rol admin con
  protección del último), Grupos, Movimientos (gastos + pagos, export CSV),
  Auditoría de acciones administrativas, Estado (versión/entorno/pings, sin
  secretos) y Configuración (moneda por defecto, feature flags).
- **Autorización real por endpoint**: cada Route Handler de `src/app/api/admin/*`
  verifica el Bearer token contra Supabase Auth y la pertenencia a `app_admins`
  antes de responder; usa un cliente **service-role** server-only. Ocultar
  links/componentes no alcanza — la seguridad está en el backend.
- **Migración `0010_admin.sql`**: tablas `app_admins` (con trigger que impide
  quedarse sin ningún administrador), `admin_audit_log`, `admin_settings`
  (defaults seguros), + índices por `created_at`. RLS activada **sin policies**
  (sólo `service_role` accede).
- **Migración `0011_admin_functions.sql`**: funciones SQL que hacen toda la
  agregación del panel (el backend no baja filas), sólo ejecutables por
  `service_role`.

### Notas

- `SyncProvider` no arranca el motor local-first ni la sesión anónima en rutas
  `/admin`.
- Limitaciones del modelo actual (documentadas): `expenses`/`payments` no tienen
  `created_by` → no hay métricas de movimientos por usuario; no hay categorías;
  no hay log de errores de negocio.

## [0.13.0] - 2026-09-01

Foco en saldar deudas de un toque, moneda por ubicación e idioma consistente.
Sin cambios de esquema. Sin migraciones.

### Added

- **Saldar una deuda en un toque.** En "Quién le debe a quién" cada deuda se
  muestra como "Felipe le debe $12.500 a Cami" con un botón **Saldar** que abre
  el pago con pagador, receptor, monto y fecha precargados. Se puede elegir
  **deuda completa** o **pago parcial** (valida > 0 y ≤ deuda pendiente). Al
  confirmar: balances al instante, pago en la actividad, toast con **Deshacer**
  (10 s) y **✕**. Funciona offline; el id de cliente + upsert evitan duplicados
  en reintentos de sync. El "Registrar pago" manual sigue disponible.
- **Detección de país → moneda** al crear un grupo: país por IP (header de
  Vercel, sin guardar la IP) → región del navegador (`Intl.Locale`) → última
  moneda elegida → USD. Mensaje discreto bajo el selector ("Seleccionamos ARS
  según tu ubicación. Podés cambiarlo."), es/en. Nunca bloquea la creación.
  Mapa país→moneda centralizado y ampliable (`src/domain/countryCurrency.ts`).
- **Quetzal guatemalteco (GTQ)** en el catálogo de monedas (2 decimales,
  `es-GT`). Guatemala → GTQ en la detección.
- **Tarjetas de grupo orientadas al usuario**: con "yo" elegido muestran
  "Debés / Te deben / Estás al día", última actividad y aviso de cambios sin
  sincronizar; sin elegir, un CTA "Indicá quién sos en este grupo".
- `docs/ACCOUNT_RECOVERY.md`: diseño (por etapas) de "Guardar / recuperar mi
  FIVI" con Supabase Auth. Aún no implementado.

### Changed

- **Selector de moneda cerrado por defecto**: pasa a un `<select>` nativo — se
  abre al tocarlo, se cierra al elegir o tocar afuera, navegable con teclado y
  accesible; no empuja el contenido.
- **Auto-archivado más estricto**: un grupo sólo se archiva solo si además de no
  tener actividad reciente, **todos los balances están en cero** y **no hay
  cambios sin sincronizar**. Un grupo viejo con deuda pendiente ya no se archiva.
- Mensajes de validación propios y traducidos (formularios con `noValidate`); se
  reemplaza el "Please fill out this field" del navegador.

### Fixed

- **Idioma inconsistente** (la app podía verse en inglés con "Español"
  seleccionado). i18next arranca en el idioma efectivo (preferencia > navegador
  > es) y un script en `<head>` fija `<html lang>` antes del primer paint: el
  selector, el atributo y el texto coinciden.

## [0.12.1] - 2026-09-01

### Fixed

- **Abrir un enlace de invitación directamente** (`/join/<token>`, como cuando
  un amigo lo recibe compartido) fallaba con "Las invitaciones requieren
  Supabase configurado". `SyncProvider` sembraba su estado con `remote_ready:
  true`, así que la página de canje actuaba contra el remoto stub antes de que
  Supabase cargara. Ahora se siembra con el estado real del motor (en modo
  cloud, `remote_ready` es `false` hasta que el remoto real está listo). Entrar
  a la invitación desde dentro de la app ya funcionaba. Sin cambios de esquema.

## [0.12.0] - 2026-09-01

Mejoras de UX en la carga de gastos y corrección de un problema de escala en
móvil. Sin cambios de esquema ni de API. Sin migraciones.

### Added

- **Atajos de "Gastos frecuentes"** en el alta de gasto: chips con emoji +
  concepto arriba del campo de descripción. Al elegir uno se precarga el
  concepto y el foco pasa al importe; la carga manual sigue igual. La lista
  prioriza los conceptos más usados del grupo (descripciones que se repiten
  ≥ 2 veces, normalizadas sin acentos/caso) y se completa con una lista por
  defecto (Supermercado, Nafta, Comida, Café, Bebida, Transporte) hasta 6.
  El modelo no tiene categorías: sólo se sugiere el texto del concepto.
- **Botón de cierre (✕) en las notificaciones** (toast), además del
  auto-cierre existente.

### Changed

- El toast ya no se superpone al menú de navegación inferior: se posiciona por
  encima (el menú publica su alto real) y sólo la tarjeta captura toques.

### Fixed

- **Zoom / salto de escala en móvil tras crear un grupo.** Los controles de
  formulario pasan a 16px (`text-base`): por debajo de 16px iOS Safari hace
  zoom automático al enfocar y no lo revierte al navegar. Además se quitó el
  `autoFocus` que abría el teclado al cargar (`/nuevo` y el wizard de gasto) y
  el alto del layout pasa a ser estable (`100svh`) para que el teclado no
  provoque reflow. No se bloquea el zoom manual.

## [0.11.0] - 2026-09-01

Mejora de la pantalla de inicio y una vía para unirse a un grupo desde ahí. Sin
cambios de lógica de negocio, modelo de datos ni de API. Sin migraciones.

### Added

- **Unirse a un grupo desde el inicio.** Nuevo desplegable "¿Tenés una
  invitación?" en `/` (y en la lista "Mis grupos") con un campo para pegar el
  enlace de invitación o escribir el código a mano. Acepta el link completo
  (`.../join/<token>`) o el código suelto; en modo local también reconoce
  `.../g/<id>`. Reusa la pantalla `/join/<token>` existente para el canje —
  conocer el ID del grupo por sí solo sigue sin dar acceso (RLS).

### Changed

- **Nueva pantalla de inicio** (estado sin grupos): titular grande, subtítulo y
  la lista de pasos numerada (01/02/03, acento naranja) con divisores en lugar
  de viñetas. El mismo encabezado se aplica a la vista "Mis grupos".

### i18n

- Claves nuevas bajo `onboarding` (es/en): `subtitle`, `haveInvite`,
  `inviteLabel`, `invitePlaceholder`, `inviteHint`, `inviteSubmit`,
  `inviteRequired`.

## [0.10.1] - 2026-09-01

### Changed

- **Saldo a favor en verde** (`#147A5A` claro / `#3FBF93` oscuro), no en azul.
  Deuda sigue en naranja; el signo +/− lo indica igual. Contraste AA en ambos
  temas.

### Verificado

- Auditoría de sincronización en producción: sesión anónima válida; push
  (grupo + participantes + gasto + reparto + pago) llega a Supabase sin rechazo
  de RLS y la cola se vacía; pull completo e incremental 200 con avance de
  cursor; 12/12 requests REST OK; WebSocket de Realtime conecta y la suscripción
  `postgres_changes` responde `status: ok`; UI en "Sincronizado", cola sin
  items agotados. **Sin errores; sin cambios necesarios.**

Rediseño visual "flat / editorial" según el artefacto de estilo + modo oscuro
con selector. Sin cambios de lógica de negocio, modelo de datos ni de API. Sin
migraciones.

### Added

- **Modo oscuro con selector de 3 opciones** (`Más → Configuración →
  Apariencia`): Sistema / Claro / Oscuro. Preferencia en `localStorage`
  (`fivi:theme`), se aplica al instante sin recarga, sin flash (script en
  `<body>` antes del paint), y actualiza `<meta name="theme-color">` y
  `<html data-theme>`. "Sistema" sigue `prefers-color-scheme` en vivo.
  Paleta oscura derivada del mismo lenguaje visual, con contraste AA.
- `ThemeProvider` + `useTheme()`.

### Changed

- **Nuevo sistema de tokens y estilo flat**: paleta azul (`#1F5FD6`/`#1648A6`) +
  naranja (`#E2662F`/`#B94718`) sobre neutros cálidos; esquinas rectas (sin
  `border-radius`), bordes de 2 px (`border-strong` `#17161A` / `border` sutil),
  micro-labels en mayúsculas (`.label-caps`). Tipografías **Archivo** (UI) y
  **Space Grotesk** (números / display), self-host offline (`public/fonts/`).
- Saldos: positivo (a favor) en **azul**, negativo (debés) en **naranja** — el
  signo +/− lo sigue indicando además del color.
- Todos los componentes base y las 19 pantallas migrados a los tokens nuevos.
  Service worker `v8` (fuentes + CSS cambiaron).
- `Money` usa `Space Grotesk` tabular.

### Removed

- Componentes muertos de antes del rediseño (`BalanceList`, `CurrencySelect`,
  `ExpenseForm`, `MoneyInput`, `MoneyText`, `TransferList`). `parseAmount` se
  movió a `src/lib/amount.ts`.

### Tests

- `idioma.spec.ts`: pasada nueva para el tema (Sistema/Claro/Oscuro cambia
  `data-theme` y `<meta theme-color>` al instante y persiste tras recargar).

## [0.9.1] - 2026-08-31

Auditoría responsive mobile + fix de fecha relativa. Sin cambios de lógica de
negocio, modelo de datos ni de API. Sin migraciones.

### Fixed

- **Fecha relativa "hace 23 horas" en un evento recién creado**: el resumen del
  grupo formateaba el pago reciente con `formatRelative(payment_date)`, pero
  `payment_date` es una **fecha sola** (`YYYY-MM-DD`) y `new Date("2026-08-31")`
  es medianoche **UTC** → en husos negativos (UTC-3) el diff daba ~-23 h. Ahora
  esa fila usa la fecha del pago (`formatDate`, medianoche local), igual que las
  filas de gasto. Además `format.ts` interpreta cualquier fecha sola como
  medianoche local (`toLocalDate`) y `formatRelative` de un evento con menos de
  1 minuto devuelve "ahora" / "now" (antes "este minuto" / "this minute").
- **Overflow horizontal en `Actividad` y `Gastos` a 320 px**: la fila de chips
  de filtro tenía `overflow-x-auto` y el último chip se salía del viewport.
  Ahora la fila usa `flex-wrap` (todos los filtros visibles, sin scroll).

### Changed

- **Service worker `v7`** + auto-recarga al actualizar: si una versión nueva
  toma el control (`skipWaiting` + `clients.claim`), la página se recarga una
  vez para tomar los assets nuevos. Evita que un caché viejo siga mostrando una
  UI previa (causa probable de reportes de "responsive roto" sobre builds
  anteriores al rediseño).

### Tests

- `responsive.spec.ts` reescrito: además de "sin scroll horizontal a nivel
  documento", verifica que **ningún elemento** desborde el viewport
  (el `body { overflow-x: hidden }` puede enmascararlo) y que el contenido no
  **colapse a una columna angosta** (`<main>` y su primer bloque ~= ancho
  disponible). Anchos 320/360/375/390/430; pasada extra en inglés.
- `format.test.ts`: evento recién creado → "ahora"/"now"; fecha sola tratada
  como local; `formatRelative` con timestamp completo inmune al huso.

Grupos archivables (para que no se acumulen grupos eternos en la lista) +
archivado automático por inactividad + snapshot de respaldo.

### Added

- **Archivar / restaurar grupo** (`Más → Configuración`). Archivar saca el grupo
  de la lista principal sin borrarlo; se restaura con un toque desde la sección
  "Archivados" del inicio o desde el propio grupo. Es un flag `archived_at` que
  se sincroniza como cualquier campo del grupo (archivar en un dispositivo
  archiva en todos).
- **Archivado automático**: al abrir la app se archivan los grupos sin gastos ni
  pagos nuevos (ni cambios en sus datos) en los últimos **30 días**
  (`ARCHIVE_AFTER_DAYS`). Aviso por toast; siempre restaurable.
- **Snapshot de respaldo** (`group_archives`, migración `0009`): al archivarse un
  grupo, un trigger de Postgres guarda un JSON completo (grupo + participantes +
  gastos + reparto + pagos) para export/backup a futuro. Sólo lo ve un miembro
  del grupo (RLS).
- Sección "Archivados" colapsable en el inicio; aviso "Grupo archivado" con
  acción de restaurar al abrir un grupo archivado.

### Migración Supabase

- **`0009_group_archive.sql`** — **backward-compatible** (aditiva pura). Agrega
  `groups.archived_at`, la tabla `group_archives` + su policy de select, y el
  trigger `snapshot_group_on_archive`. Aplicar junto con `0.9.0`. Un frontend
  anterior la ignora.

## [0.8.2] - 2026-08-31

Corrige una condición de carrera al arrancar en modo cloud que podía dejar un
grupo (y sus movimientos) sólo en el dispositivo, sin llegar nunca al servidor.
Síntoma: al querer compartir ese grupo, el servidor rechazaba crear la
invitación ("new row violates row-level security policy" — el grupo no tenía
membresía de dueño en Postgres). Sin cambios de esquema ni de API.

### Fixed

- **`SyncEngine` no hace push mientras el remoto real (Supabase) todavía no
  reemplazó al stub inicial.** Antes, cualquier operación encolada en esa
  ventana (~1-3 s tras cargar la página) se enviaba al stub, que la "aceptaba",
  y se marcaba como sincronizada sin haber llegado al servidor. `setRemote()` →
  `markRemoteReady()` ya forzaba un `syncNow()` al conectar; ahora ése es el
  primero que realmente envía la cola.
- **Recuperación de datos huérfanos**: tras el primer pull completo con el
  remoto real, `SyncEngine` re-encola el alta de los grupos locales vivos (y sus
  participantes/gastos/pagos) que el servidor no devolvió y que no tienen ya una
  op en la cola. Un grupo que quedó sólo en local por la carrera se sube solo en
  la próxima carga; al insertarse en Postgres, el trigger `groups_add_owner` le
  asigna la membresía de dueño y compartir vuelve a funcionar.

Identidad de marca. Sin cambios de lógica de negocio, datos ni backend.

### Changed

- **Nueva identidad de marca**: app icon, favicons e íconos PWA reemplazados por
  el logotipo definitivo (cuadrado redondeado + círculo naranja). `favicon.ico`
  nuevo (16 + 32). `scripts/gen-icons.mjs` reescrito para dibujar la marca nueva
  con antialiasing (sigue sin dependencias). Set completo de logotipos en
  `brand/`. Service worker `v6` (invalida el caché de íconos anterior).
- Onboarding: se muestra el app icon sobre el título.
- `manifest.webmanifest`: `background_color` `#17161a` (fondo de la marca),
  `theme_color` `#0e1111`.

## [0.8.0] - 2026-08-31

Rediseño mobile-first + internacionalización ES/EN. **No cambia** reglas de
negocio, `domain/`, repos `data/`, motor `sync/` ni backend/auth: sólo la capa
de presentación. Sin migraciones de Supabase. Detalle y desviaciones respecto
del handoff en [`docs/REDISENIO.md`](docs/REDISENIO.md).

### Added

- **i18n ES/EN** (`react-i18next` + `i18next`): español por defecto y fallback,
  cambio en caliente sin recarga desde `Más → Configuración → Idioma`,
  preferencia en `localStorage` (`fivi:lang`), sugerencia por
  `navigator.language` en la primera visita. Todos los textos en
  `src/i18n/locales/{es,en}.json` (12 namespaces) con interpolación y
  pluralización. Formato de fechas / números / moneda con `Intl` y el locale de
  la UI; la moneda del grupo no cambia con el idioma.
- **Tokens de diseño** (`globals.css` + `tailwind.config.ts`): custom properties
  RGB con paleta clara y oscura (`prefers-color-scheme`), foco visible WCAG 2.2,
  `prefers-reduced-motion`.
- **Navegación inferior** de 4 destinos (Resumen / Gastos / Personas / Más) y
  layout mobile-first (`AppShell` ancho fluido, tope 480 px, sin scroll
  horizontal a nivel documento).
- Rutas nuevas: `/g/[groupId]/nuevo/personas`, `/g/[groupId]/listo`,
  `/g/[groupId]/personas`, `/g/[groupId]/personas/[participantId]`,
  `/g/[groupId]/actividad`, `/g/[groupId]/mas`.
- **Actividad del grupo** (`queries.getGroupActivity`): línea de tiempo derivada
  de timestamps y tombstones existentes, sin schema nuevo. Filtro por tipo y
  persona.
- Selector opcional por dispositivo "¿Quién sos en este grupo?" (`data/settings`,
  no se sincroniza) para "Tu balance" y el filtro "Míos".
- `SyncBanner`: avisos sobre el contenido para sin conexión / error del servidor
  (con "Reintentar") / sin acceso al grupo.
- E2E `responsive.spec.ts` (sin scroll horizontal en 320/360/390/430 px) e
  `idioma.spec.ts` (cambio y persistencia de idioma); test unitario de paridad
  de claves i18n (`tests/i18n/parity.test.ts`) y de `getGroupActivity`.

### Changed

- Flujos de alta de grupo y de gasto reescritos como asistentes de 3 pasos con
  `StepIndicator`.
- `flow.spec.ts` reescrito para la UI nueva; `playwright.config.ts` fija
  `locale: es-AR` (la app toma el idioma del navegador si no hay preferencia).
- Componentes existentes migrados a los tokens y a i18n (`Button`, `fields`,
  `EmptyState`, `CurrencyPicker`, `ExpenseWizard`, `InvitesSection`,
  `ShareButton`, `AddToPastExpenses`, …).

## [0.7.2] - 2026-08-31

### Fixed

- **Sync cloud rota**: `supabaseRemote.pull` arrancaba la paginación keyset de
  los ids de `expenses` con un cursor vacío (`.gt("id", "")`), y PostgREST
  respondía `400 invalid input syntax for type uuid: ""`. Cada corrida de sync
  fallaba y quedaba en "Reintentando…"; la app funcionaba local-first pero nada
  se sincronizaba al servidor. Introducido en 0.7.0 (paginación keyset). El
  cursor ahora arranca en el UUID nil. Sin cambios de esquema.

## [0.7.1] - 2026-08-31

### Fixed

- `INSERT ... RETURNING` sobre `groups` fallaba con RLS: la re-lectura de la fila
  recién creada corría la policy de SELECT antes de que el trigger AFTER creara
  la membresía de owner. El push de fivi (`upsert` sin `.select()`,
  `return=minimal`) no se veía afectado, pero el modelo no debería depender de
  ese detalle. Migración `0008_groups_select_creator.sql`: `groups_select` ahora
  también permite `created_by = auth.uid()` (el creador siempre ve su grupo; no
  debilita el acceso: `created_by` lo fija y congela un trigger).

### Migración Supabase

- **`0008_groups_select_creator.sql`** — **backward-compatible**. Reemplaza
  `groups_select` (de `0007`) por una versión con un `OR created_by = auth.uid()`.
  Un frontend `0.7.0` sigue funcionando contra este esquema. Aplicar con
  `0.7.1`.

## [0.7.0] - 2026-08-31

Seguridad de acceso a los grupos: autenticación anónima de Supabase + RLS por
membresía. **Cambio incompatible para despliegues que ya tenían RLS permisiva**
(ver `docs/RELEASES.md` § Rollback y Supabase).

### Added

- Supabase Anonymous Sign-In: sesión anónima persistida, sin email ni contraseña
  (`src/lib/supabase.ts`).
- Tabla `group_members` (roles `owner` / `member`) y `groups.created_by`
  (migración `0005_membership.sql`). El creador de un grupo queda `owner`.
- Invitaciones con token: enlace `/join/<token>` con token aleatorio de 256 bits;
  el servidor guarda sólo el hash SHA-256 (`group_invites`, migración
  `0006_invites.sql`). RPC `redeem_group_invite` valida vigencia y revocación en
  el servidor.
- Ruta `/join/[token]` y sección "Invitaciones" en la configuración del grupo
  (`InvitesSection`, sólo en modo cloud).
- Identificación de versión en la app: pie "FIVI vX.Y.Z · <commit>" en el inicio
  (`AppVersion`, `src/lib/appInfo.ts`), inyectada en build (`next.config.mjs`).
- Tests de RLS reales en proceso con `@electric-sql/pglite`
  (`tests/security/rls.test.ts`).
- `CHANGELOG.md`, `docs/RELEASES.md`, `.nvmrc`, workflow `release.yml`
  (validación de tags `v*`).

### Changed

- RLS: se reemplazan las policies `to anon using (true)` de `0002` por policies
  `to authenticated` basadas en `auth.uid()` + `group_members` (migración
  `0007_rls_auth.sql`). Conocer el UUID de un grupo ya no da acceso.
- `RemotePort` gana métodos opcionales de invitación; `SyncEngine` orquesta el
  canje (`redeemInvite` → `trackGroup`).
- El Service Worker pasa a `v5` y normaliza `/join/<token>` → `/join/_`.

### Security

- `anon` deja de tener acceso a los datos privados. Sólo un miembro lee/edita un
  grupo y sus movimientos; sólo el `owner` administra la membresía.
- Un rechazo del servidor por falta de acceso (RLS) ya no se descarta en
  silencio: el dato local se conserva y la UI muestra "Sin acceso al grupo".

## [0.6.0] - 2026-08-30

Hardening técnico de la sincronización (sin cambios de UI).

### Added

- Cursor de sincronización server-owned: columna `sync_revision` asignada por
  Postgres (secuencia + trigger), usada como cursor incremental en lugar de
  `updated_at` (migración `0003_sync_revision.sql`). Elimina la dependencia del
  reloj del dispositivo.
- Paginación del pull (500 filas por página) para las cinco tablas.
- Integridad referencial en el servidor: FKs compuestas por `group_id` + trigger
  de validación cross-group (migración `0004_referential_integrity.sql`).
- CI en GitHub Actions (`.github/workflows/ci.yml`): `npm ci` + lint + typecheck
  + test + build + E2E, sin credenciales de Supabase.
- Tests E2E con Playwright (flujo completo + escritura offline).

### Changed

- Reintentos de la cola con exponential backoff + jitter, tope de intentos (5) y
  distinción entre errores "reintentables" y "agotados"
  (`sync_queue.next_attempt_at`, Dexie v2). Un item fallido no bloquea a los
  demás; backoff también a nivel corrida.
- Dependencias al día dentro de sus ramas (Next 15.5.x, Vitest 4).

### Fixed

- Un lote de push rechazado por transporte (red caída) ya no "gasta" intentos:
  los items vuelven a `pending`.

---

Las versiones **0.1.0 – 0.5.0** corresponden a las etapas de construcción 1 a 5
(dominio + datos locales, pantallas, backend Supabase, formas de dividir un
gasto, verificación cloud + offline). No se publicaron como releases ni se
etiquetaron; el detalle está en el historial de git (`git log`, commits
"Etapa N").
