# FIVI — Versionado, releases y rollback

Guía práctica para un proyecto personal que puede crecer a producción. Sin
GitFlow ni ceremonia innecesaria. La fuente de verdad de la versión es
`package.json`.

---

## 1. Versionado

**Semantic Versioning** en `MAJOR.MINOR.PATCH`, con FIVI todavía en `0.x`
(pre-1.0: la API/el esquema pueden evolucionar).

| Parte | Cuándo subirla |
| --- | --- |
| **PATCH** (`0.7.0 → 0.7.1`) | correcciones compatibles, sin cambios de esquema ni de comportamiento observable |
| **MINOR** (`0.7.1 → 0.8.0`) | funcionalidad nueva compatible **y** —mientras estemos en `0.x`— cambios incompatibles (de frontend o de esquema Supabase) |
| **MAJOR** (`0.x → 1.0.0`) | primera versión estable. **No subir a `1.0.0` automáticamente**: es una decisión deliberada cuando el modelo de datos y el de acceso se consideren estables |

La decisión de qué parte subir es **siempre manual y explícita** (ver §9). No hay
automatización que la infiera.

### Versión actual

`0.7.0` (`package.json`). Corresponde al estado tras la Etapa 7 (auth + RLS +
invitaciones). Racional de la línea base:

- FIVI se construyó en 7 etapas; cada una agregó funcionalidad significativa.
- Nunca hubo tags ni releases previas, así que `0.7.0` es la primera versión
  asignada deliberadamente. Se mapean las etapas 1–5 a `0.1.0`–`0.5.0`
  (histórico, sin tag), la Etapa 6 (hardening) a `0.6.0` y la Etapa 7 a `0.7.0`.
- Sigue en `0.x`: la Etapa 7 introdujo un cambio incompatible (RLS), que en
  pre-1.0 sube MINOR, no MAJOR.

---

## 2. Estrategia de ramas

Trunk-based simplificado. Nada de `develop` permanente mientras el proyecto sea
de una persona.

```
main                  producción estable (siempre desplegable, siempre verde en CI)
 ├─ feature/<slug>     funcionalidad nueva     → PR → merge a main
 ├─ fix/<slug>         corrección no urgente   → PR → merge a main
 └─ hotfix/<x.y.z>     corrección urgente de producción, ramificada de un tag
```

- Las ramas de trabajo son de vida corta y se borran al mergear.
- CI (`.github/workflows/ci.yml`) corre en **todo push de rama y en cada PR**; no
  se mergea nada rojo.
- Si en el futuro varias personas integran en paralelo, se puede añadir una rama
  `develop` como sala de integración antes de `main`. Hoy no aporta.

---

## 3. Procedimiento de release

```
feature/* ─► PR ─► CI verde ─► merge a main
        │
        └─► en main:
            1. decidir la nueva versión (PATCH/MINOR/MAJOR, §1)
            2. npm version <patch|minor|major> --no-git-tag-version   # sube package.json (+ lock)
            3. mover lo de "Unreleased" a una sección [x.y.z] - fecha en CHANGELOG.md
            4. commit:  "release: vX.Y.Z"
            5. push a main
            6. esperar CI verde en main
            7. tag anotado exacto sobre ese commit:
                 git tag -a vX.Y.Z -m "FIVI vX.Y.Z"
                 git push origin vX.Y.Z
            8. el workflow release.yml valida el tag y publica la GitHub Release
            9. desplegar (§4)
```

Reglas:

- El tag **siempre** es `vMAJOR.MINOR.PATCH` (con `v`), anotado (`-a`), y apunta
  **exactamente** al commit desplegado.
- `release.yml` **falla** si `vX.Y.Z` no coincide con `package.json`, o si
  lint/typecheck/test/build no pasan. Sin tag válido no hay Release.
- Nunca se reetiqueta: si un tag salió mal, se crea el siguiente PATCH.

### GitHub Release

La crea `release.yml` al pushear el tag, con notas autogeneradas + el cuerpo de
la sección correspondiente del CHANGELOG. Debe contener: número de versión,
funcionalidades principales, fixes, cambios importantes, **notas de migración**
(qué migraciones aplicar) y **breaking changes** si los hay.

### Trazabilidad

Una versión desplegada se relaciona inequívocamente con:

| | dónde |
| --- | --- |
| versión | `package.json` / pie "FIVI vX.Y.Z" en la app / nombre del tag |
| tag | `vX.Y.Z` (anotado, en `origin`) |
| commit | el que apunta el tag / pie "· `<sha>`" en la app / `NEXT_PUBLIC_APP_COMMIT` |
| deployment | deployment de Vercel construido desde ese commit (Vercel guarda el SHA) |

---

## 4. Despliegue

Hoy el deploy es **manual** desde local (no hay auto-deploy desde GitHub):

```bash
git checkout vX.Y.Z          # el commit exacto de la release
npm ci
vercel --prod                # proyecto: "fivi" (team vidalsotofelipe); .vercel/ ya linkeado
```

Vercel registra el commit de git del deployment. Verificar tras desplegar:

- abrir la app y confirmar el pie **"FIVI vX.Y.Z"** (y el commit corto);
- humo: crear grupo, gasto, balance; en cloud, un `/join/<token>` en otro
  dispositivo/sesión.

Ningún workflow despliega producción automáticamente (por diseño: el deploy no
está aún lo bastante blindado para eso).

---

## 5. Rollback del frontend

El rollback de frontend **NO** revierte la base de datos (ver §6).

### Estrategia A — re-promover un deployment anterior (preferida)

Vercel conserva los deployments históricos. Si `v0.8.0` falla:

- Vercel → proyecto `fivi` → Deployments → localizar el de `v0.7.1` (por commit
  o fecha) → **Promote to Production** (o `vercel promote <url>`).
- Instantáneo, sin tocar git. Anotar en el CHANGELOG que producción quedó en
  `v0.7.1` por rollback.

### Estrategia B — revertir en git

Si hace falta arreglar el historial (p. ej. el deploy sale de `main`):

```bash
git revert <sha-malo>        # crea un commit que deshace el cambio
# resolver, commit, PR, CI, merge a main, nueva versión PATCH, tag, deploy
```

Nunca `git reset --hard` ni `git push --force` sobre `main` (rama compartida /
producción).

### Estrategia C — hotfix desde una versión anterior

Ver §7.

---

## 6. Rollback y migraciones Supabase — LEER ANTES DE TOCAR EL ESQUEMA

> **El rollback del frontend no implica rollback de la base de datos.**
> Volver la app a `v0.6.0` con la base en el esquema de `v0.7.0` puede dejar la
> app inutilizable si esa migración fue incompatible.

Reglas duras:

1. **Nunca** modificar una migración ya aplicada en producción. Un cambio nuevo
   = un archivo `NNNN_*.sql` nuevo.
2. Evitar cambios destructivos inmediatos. Preferir **Expand → Migrate →
   Contract**:
   - **Expand**: agregar lo nuevo sin quitar lo viejo (p. ej. columna
     `sync_revision` sin borrar `updated_at`).
   - **Migrate**: releases siguientes empiezan a usar lo nuevo.
   - **Contract**: sólo cuando ya no hay chance razonable de rollback a una
     versión que usaba lo viejo, se elimina lo viejo (en una release aparte).
3. **No** hacer en la misma release `ADD` de estructura nueva + migración +
   `DROP` de la vieja si eso impide correr la versión anterior de FIVI.
4. Diseñar cada migración para permitir el rollback de la app cuando sea
   razonable.

### Clasificación de compatibilidad de las migraciones actuales

Para cada migración: **¿puede el frontend de la versión anterior funcionar contra
este esquema?**

| Migración | Release | Compatibilidad | Nota |
| --- | --- | --- | --- |
| `0001_init` | 0.1.0 | — | esquema base |
| `0002_sync_and_policies` | 0.3.0 | backward-compatible | Realtime + RLS permisiva `anon` |
| `0003_sync_revision` | 0.6.0 | **backward-compatible** | agrega columna + trigger; `updated_at` sigue estando. El frontend previo (que filtraba por `updated_at`) sigue funcionando |
| `0004_referential_integrity` | 0.6.0 | **backward-compatible** | agrega constraints; el frontend previo ya escribía datos consistentes |
| `0005_membership` | 0.7.0 | **ROLLBACK RISK** | crea `group_members`, `created_by` y el trigger que hace `owner` al creador |
| `0006_invites` | 0.7.0 | **ROLLBACK RISK** | tabla de invitaciones + RPC de canje |
| `0007_rls_auth` | 0.7.0 | **INCOMPATIBLE — ROLLBACK RISK** | **elimina** las policies permisivas `to anon` de `0002` y las reemplaza por policies que exigen `auth.uid()` + membresía |

**`0005`–`0007` son un corte duro, no Expand→Migrate→Contract.** Las policies de
RLS no pueden coexistir de forma útil (permisiva `to anon` + restrictiva
`to authenticated` ⇒ gana la permisiva ⇒ no hay seguridad), así que `0007` hace
el `DROP` en la misma release que introduce el modelo nuevo. Consecuencia:

- Un frontend **anterior a `0.7.0`** (sin sesión anónima, sin flujo de
  invitación) **no puede leer ni escribir ningún grupo** contra una base con
  `0007` aplicado.
- Por lo tanto, **`0.7.0` es el piso de rollback** para cualquier entorno donde
  se hayan aplicado `0005`–`0007`. No bajar el frontend de `0.7.0` ahí.
- Si fuese imprescindible bajar más, hay que aplicar antes una migración
  compensatoria (`0008`) que reponga policies permisivas — lo que anula la
  seguridad; sólo para una emergencia y de forma temporal.
- Camino recomendado: aplicar `0005`–`0007` **junto con** el despliegue de
  `0.7.0`, y a partir de ahí tratar `0.7.0` como base mínima.

> Estado actual: `0003`–`0007` **todavía no se aplicaron** al proyecto Supabase
> real. Producción corre un esquema `0001`+`0002`. Al pasar a `0.7.0` se aplican
> `0003`–`0007` de una vez (y, según decisión del proyecto, se vacían los datos
> de prueba antes, porque los grupos viejos no tienen dueño — ver el comentario
> al pie de `0007_rls_auth.sql`).

### Al preparar una release con cambios de Supabase

En la descripción del PR / de la GitHub Release, indicar explícitamente por cada
migración nueva: **backward-compatible** / **parcialmente compatible** /
**incompatible**, y si alguna hace imposible el rollback del frontend, marcarla
**ROLLBACK RISK** antes de mergear.

---

## 7. Hotfix

Para corregir producción sin arrastrar lo que haya en `main` sin liberar:

```bash
git checkout v0.7.0                 # el tag que está en producción
git checkout -b hotfix/0.7.1
# ... corregir, con el mínimo cambio posible ...
npm run lint && npm run typecheck && npm run test && npm run build
npm version patch --no-git-tag-version     # 0.7.0 -> 0.7.1
# actualizar CHANGELOG (sección [0.7.1])
git commit -am "hotfix: <qué se arregló> (v0.7.1)"
git tag -a v0.7.1 -m "FIVI v0.7.1"
git push origin hotfix/0.7.1 v0.7.1
# desplegar v0.7.1 (§4)
# después: mergear hotfix/0.7.1 a main (PR) para no perder el fix
```

Si el hotfix necesita un cambio de esquema, aplican las reglas de §6: migración
nueva, nunca editar una existente, y evaluar el impacto en rollback.

---

## 8. Información de build en la app

`next.config.mjs` inyecta en build tres variables públicas (no sensibles):

| Variable | Origen |
| --- | --- |
| `NEXT_PUBLIC_APP_VERSION` | `package.json` `version` |
| `NEXT_PUBLIC_APP_COMMIT` | `VERCEL_GIT_COMMIT_SHA` / `GITHUB_SHA` / `git rev-parse --short HEAD` / `"unknown"` |
| `NEXT_PUBLIC_APP_ENV` | `VERCEL_ENV` / `NODE_ENV` |

`src/lib/appInfo.ts` las lee con fallbacks; `AppVersion` (pie del inicio) muestra
`FIVI v0.7.0 · <commit>` (y el entorno si no es `production`). No hay números de
versión hardcodeados en ningún otro lado.

---

## 9. Checklist pre-release

```
[ ] funcionalidad probada a mano (flujo local; si hay backend, flujo cloud + /join)
[ ] npm run lint
[ ] npm run typecheck
[ ] npm run test
[ ] npm run build
[ ] migraciones nuevas revisadas (no se editó ninguna aplicada; una por cambio)
[ ] compatibilidad de rollback evaluada y anotada (backward / parcial / incompatible / ROLLBACK RISK)
[ ] versión decidida y aplicada (npm version ..., manual)
[ ] CHANGELOG.md actualizado (sección [x.y.z] con fecha)
[ ] merge a main, CI verde en main
[ ] tag anotado vX.Y.Z creado y pusheado (apunta al commit desplegado)
[ ] GitHub Release publicada (release.yml o manual) con notas de migración
[ ] deployment hecho y verificado (pie "FIVI vX.Y.Z" + humo)
```

---

## 10. Qué está automatizado y qué no

Automatizado (GitHub Actions):

- **`ci.yml`** — en cada push de rama y PR: `npm ci` + lint + typecheck + test +
  build + E2E + `npm audit` (informativo). Node 22. Sin secretos de Supabase.
- **`release.yml`** — al pushear un tag `v*`: valida que el tag == `package.json`,
  corre lint + typecheck + test + build, y publica la GitHub Release. **No**
  despliega producción.

Deliberadamente **no** automatizado:

- decidir el próximo número de versión (PATCH/MINOR/MAJOR) — siempre manual;
- crear tags o releases reales sin intervención;
- desplegar a producción;
- aplicar migraciones de Supabase.
