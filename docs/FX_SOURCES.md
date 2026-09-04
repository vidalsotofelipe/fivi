# Fuentes de cotización

Estado: **primera fuente oficial implementada (ARS)**. El resto de las monedas
usa un proveedor de mercado (`open.er-api.com`), declarado como tal en la
interfaz. Este documento tiene el relevamiento que pide el requerimiento —**qué
fuente oficial cubre cada una de las 35 monedas soportadas**— y el diseño para ir
sumándolas.

## Implementado

| Moneda | Fuente | Oficial | Valor usado |
|---|---|---|---|
| **ARS** | [Banco de la Nación Argentina](https://bna.com.ar/Cotizador/MonedasHistorico) — "Cotizaciones de divisas en el Mercado Libre de Cambios, Valor Hoy" | Sí (banco público) | **Punto medio entre compra y venta** |
| Todas las demás | `open.er-api.com` | No — referencia de mercado | El que publica el proveedor |

### Por qué el punto medio

El BNA publica compra y venta (por ejemplo 1499 / 1508). Un saldo en FIVI puede
ser a favor o en contra, así que tomar una sola punta inclinaría la estimación
hacia un lado según el signo. El punto medio es neutral, y la interfaz aclara que
se usa el medio cuando la fuente publica las dos puntas.

### El BNA no tiene API

Publica una tabla HTML (`table.cotizador`), así que se parsea. Eso es frágil por
definición, y el código lo trata como tal — ver `src/lib/fx/bna.ts`:

- la fila se busca por su **etiqueta** ("Dolar U.S.A"), nunca por posición;
- se descartan las filas marcadas `(*)`, que cotizan cada 100 unidades;
- los números se validan antes de creerles: compra y venta positivas, venta ≥
  compra, spread menor al 50 %, y una banda absoluta muy amplia para descartar
  lecturas absurdas;
- **falla cerrado**: ante cualquier problema —red, timeout, HTML distinto,
  números que no cierran— devuelve `null`, la moneda se queda con el proveedor de
  mercado y se muestra como tal. Nunca se inventa ni se adivina una cotización.

Si el BNA cambia el marcado, la app no se rompe: vuelve sola a la referencia de
mercado y lo dice en la interfaz. Los tests de `tests/lib/bna.test.ts` corren
contra el marcado real capturado y cubren cada modo de falla.

### Decisión pendiente que este documento dejaba abierta

En Argentina conviven varios tipos de cambio legales. Se eligió el que publica el
BNA en su cotizador de divisas (el que el usuario indicó), y la interfaz muestra
la fuente y la fecha. Si más adelante hiciera falta ofrecer otro (billete,
tarjeta, MEP), el diseño de abajo lo soporta sin tocar nada fuera de
`src/lib/exchangeRates.ts`.

## Por qué importa

El balance global convierte saldos de varias monedas a la "moneda principal"
para mostrar un número consolidado. Ese número es una **estimación**: los
importes originales por moneda siguen siendo la fuente de verdad y nunca se
tocan. Aun así, si la app cita una fuente, tiene que ser honesta sobre qué tipo
de fuente es. Un tipo de cambio de mercado no es la cotización oficial del Banco
Central, y en varios de los países donde se usa FIVI esa diferencia es grande y
tiene consecuencias.

## Regla que ya rige en el código

Una moneda **sin cotización utilizable no se convierte**. Queda fuera del total
consolidado y se lista aparte con su importe original (`missing` en
`domain/groupsSummary.ts`). No se inventa una conversión ni se cae a una fuente
distinta en silencio.

## Cobertura oficial por moneda

`Formato`: la publicación oficial que corresponde, y si es accesible por
programa (API/CSV/XML estable y público) o requiere scraping / no está publicada
en un formato consumible.

### América Latina

| Moneda | País | Fuente oficial | Accesible | Notas |
|---|---|---|---|---|
| **ARS** | Argentina | **BNA — Cotizador de divisas** (implementado) · BCRA Com. A 3500 como alternativa | Sí (BNA por HTML; BCRA por API REST) | Ver arriba. El BCRA queda como opción si se prefiere el mayorista o si el BNA cambia el marcado. |
| BOB | Bolivia | BCB — Tipo de cambio oficial | Parcial | Publicado en web; sin API estable documentada. |
| BRL | Brasil | Banco Central do Brasil — PTAX | Sí (API Olinda, REST) | Fuente oficial de referencia, muy bien documentada. |
| CLP | Chile | Banco Central de Chile — Dólar observado | Sí (API con registro gratuito) | Requiere credenciales de la BDE. |
| COP | Colombia | Banco de la República / TRM (Superfinanciera) | Sí (datos abiertos datos.gov.co) | La TRM es la tasa oficial. |
| CRC | Costa Rica | BCCR — Indicadores económicos | Sí (servicio web con registro) | Compra/venta oficiales. |
| DOP | Rep. Dominicana | Banco Central RD | Parcial | Publica series en Excel; sin API estable. |
| GTQ | Guatemala | Banguat — Tipo de cambio de referencia | Sí (servicio SOAP público) | Fuente oficial clara y sin registro. |
| HNL | Honduras | BCH | Parcial | Publicación web. |
| MXN | México | Banxico — SIE (FIX) | Sí (API con token gratuito) | El FIX es la referencia oficial. |
| NIO | Nicaragua | BCN — Tabla de deslizamiento | Parcial | Publicación web. |
| PEN | Perú | BCRP — Series estadísticas / SBS | Sí (API pública) | La SBS publica el tipo de cambio contable. |
| PYG | Paraguay | BCP | Parcial | Publicación web. |
| UYU | Uruguay | BCU — Cotizaciones | Sí (servicio web) | |
| VES | Venezuela | BCV | Parcial | Publicación web; alta volatilidad y brecha con el mercado. |

### Zona euro y Europa

| Moneda | Fuente oficial | Accesible | Notas |
|---|---|---|---|
| EUR | BCE — Euro foreign exchange reference rates | Sí (XML/CSV público) | Base natural para todo el bloque. Cubre además GBP, CHF, SEK, NOK, DKK, PLN, CZK, TRY y las asiáticas de abajo, todas contra EUR. |
| GBP | Bank of England — Statistical Database | Sí | También cubierta por el BCE. |
| CHF | BNS/SNB | Sí | También por BCE. |
| SEK | Sveriges Riksbank | Sí (API) | |
| NOK | Norges Bank | Sí (API) | |
| DKK | Danmarks Nationalbank | Sí | |
| PLN | Narodowy Bank Polski | Sí (API REST pública, sin registro) | |
| CZK | Česká národní banka | Sí (texto plano diario) | |
| TRY | TCMB (Türkiye) | Sí (XML diario) | |

### Resto del mundo

| Moneda | Fuente oficial | Accesible | Notas |
|---|---|---|---|
| USD | Federal Reserve H.10 | Sí (CSV) | Base actual de la tabla. |
| CAD | Bank of Canada — Valet API | Sí (REST público) | |
| AUD | Reserve Bank of Australia | Sí (CSV/XML) | |
| NZD | Reserve Bank of New Zealand | Sí | |
| JPY | Bank of Japan / BCE | Sí | |
| CNY | People's Bank of China — paridad central | Parcial | Publicación diaria; sin API abierta cómoda. |
| KRW | Bank of Korea — ECOS | Sí (API con registro) | |
| INR | Reserve Bank of India — reference rate | Sí | |
| THB | Bank of Thailand | Sí (API con registro) | |
| ZAR | South African Reserve Bank | Sí | |
| ILS | Bank of Israel | Sí (API) | |
| AED | Central Bank of the UAE | Parcial | AED tiene paridad fija con USD (3,6725). |

## Lectura del relevamiento

- **De las 35 monedas, ~24 tienen una fuente oficial consumible por programa**;
  el resto exige scraping o registro con credenciales por país.
- No existe una única fuente oficial que cubra las 35. Un diseño con fuentes
  oficiales es necesariamente **un proveedor por moneda o región**, con
  encadenamiento vía USD o EUR para los cruces.
- El BCE por sí solo cubre la mayoría de Europa y Asia, pero **no cubre ninguna
  moneda latinoamericana salvo BRL y MXN**, que son justamente el centro de uso
  de FIVI.

## Diseño

Ya implementado con ARS como primer caso; sumar una moneda es agregar un
override.

1. Una tabla **base** (hoy el proveedor de mercado, base USD) da cotización para
   todas las monedas.
2. Encima corren los **overrides por moneda** (`OVERRIDES` en
   `src/lib/exchangeRates.ts`): cada uno devuelve cuántas unidades de esa moneda
   equivalen a 1 USD, más su `RateSource` (fuente, si es oficial, fecha).
3. Los overrides corren en paralelo y son independientes: si uno falla, los demás
   siguen, y la moneda afectada se queda con la tabla base.
4. La condición viaja **por moneda** (`RateTable.sources`), no por tabla. El
   total consolidado sólo se llama oficial si **todas** las conversiones lo son.
5. Una moneda sin cotización utilizable no se convierte: queda fuera del total,
   se lista aparte con su importe original y no se inventa nada.

### Sumar una moneda

Escribir el fetch + parser en `src/lib/fx/<fuente>.ts` (con sus validaciones y
`null` ante la duda), y agregar un `CurrencyOverride` a `OVERRIDES`. Nada fuera
de `src/lib/exchangeRates.ts` cambia.

## Estado actual en el código

- `src/lib/fx/bna.ts` — cotización oficial del dólar del BNA: fetch con timeout,
  parser defensivo y validaciones. Exporta el parser aparte para testearlo sin
  red.
- `src/lib/exchangeRates.ts` — interfaz `Provider` (base) con `official` y
  `homepage`, registro `PROVIDERS`, `isOfficialProvider()`, y `OVERRIDES` con las
  fuentes oficiales por moneda.
- `src/domain/convert.ts` — `RateSource`, `RateTable.sources` y `sourceFor()`.
- `src/domain/groupsSummary.ts` — `GlobalBalance.rate_sources` y un `official`
  que exige que TODAS las conversiones lo sean.
- `src/components/GroupsSummaryHeader.tsx` — lista fuente, condición y fecha de
  cada moneda convertida, más la aclaración del punto medio.
- `supabase/migrations/0017_exchange_rates_sources.sql` — columna `sources` en el
  cache tibio.
- Una fuente desconocida se trata como **no oficial**: el default seguro es no
  prometer oficialidad.
