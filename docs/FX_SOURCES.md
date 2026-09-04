# Fuentes de cotización — relevamiento previo a usar fuentes oficiales

Estado: **relevamiento**. Hoy FIVI usa un único proveedor de mercado
(`open.er-api.com`) y lo declara como tal en la interfaz. Este documento es el
paso previo que pide el requerimiento: **qué fuente oficial cubre cada una de las
35 monedas soportadas**, antes de diseñar proveedores por moneda o región.

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
| ARS | Argentina | BCRA — Estadísticas cambiarias | Sí (API REST pública) | Publica el tipo de cambio mayorista (Com. A 3500). Existen múltiples tipos de cambio legales conviviendo: elegir cuál se muestra es una decisión de producto, no técnica. |
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

## Diseño propuesto (pendiente de implementar)

1. `Provider` pasa de ser único a un **registro por moneda**: `official`,
   `homepage`, `fetchRate(base, quote)`, prioridad.
2. Resolución por moneda: fuente oficial del país → si no hay, encadenar por
   USD/EUR con fuentes oficiales → si tampoco, **fuente alternativa declarada
   como tal** (la actual) → si tampoco, no convertir.
3. La condición (`official: true|false`) viaja por moneda, no por tabla, y se
   muestra en el detalle de conversión.
4. Caso especial ARS: hay más de un tipo de cambio legal. Antes de implementarlo
   hay que decidir cuál se usa y decirlo en la interfaz.

## Estado actual en el código

- `src/lib/exchangeRates.ts` — interfaz `Provider` con `official` y `homepage`,
  registro `PROVIDERS`, y `isOfficialProvider()` para resolver la condición
  desde el cache tibio sin migración de base.
- `src/domain/convert.ts` / `src/domain/groupsSummary.ts` — `official` viaja en
  `RateTable` y `GlobalBalance`.
- `src/components/GroupsSummaryHeader.tsx` — muestra fuente, fecha, condición y
  la aclaración de que no es oficial.
- Una fuente desconocida se trata como **no oficial**: el default seguro es no
  prometer oficialidad.
