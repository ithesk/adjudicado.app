# Fase 0 — Hallazgos del sistema existente

Respuestas a las preguntas de descubrimiento del [plan](plan.md), verificadas trabajando
sobre este repo (2026-07-13/14: documentación de empresa, buscador de Precios v2, precios
de ítems — todo tocó las capas que aquí se describen). No es exploración teórica.

## Stack

| Pregunta | Respuesta verificada |
|---|---|
| Framework | **Next.js 16** (App Router, Turbopack) + React 19 + TypeScript 5 + Tailwind 4 |
| Base de datos | **Supabase Postgres**. Sin ORM: `supabase-js` (query builder) + funciones **RPC** en SQL para lecturas complejas |
| Hosting | Vercel (serverless). **Restricción real:** binarios pesados (render PDF, LibreOffice, Chromium) no corren aquí |
| Auth | Supabase Auth (email/password). `src/lib/auth.ts`: `getUser()`, `getMiembro()`, `requireMiembro()` (redirige a /login u /onboarding) |
| Sesión/middleware | `src/proxy.ts` → `src/lib/supabase/session.ts` refresca el token en cada request |

## Multi-tenancy (reutilizar, no reinventar)

- Tenant = **`organizacion`**; membresía en **`miembro`** (`org_id`, `user_id`, `rol`:
  admin|colaborador). Un usuario puede pertenecer a varias organizaciones; la activa vive
  en la cookie **`org_activa`** (`ORG_COOKIE` en `src/lib/auth.ts`).
- **RLS activa en todas las tablas.** El guard es la función
  **`es_miembro(p_org uuid)`** (security definer, `supabase_schema.sql`). Policy típica:
  `for all using (es_miembro(org_id)) with check (es_miembro(org_id))`.
- Los RPC llevan el guard como primera línea: `if not es_miembro(p_org) then return; end if`
  + `revoke ... from public, anon; grant ... to authenticated`.
- Patrón de rendimiento reciente: para **lecturas**, `orgActivaLigera()` (cookie, sin
  viajes de red) porque el guard real es `es_miembro()` en SQL; las **mutaciones** usan
  `getMiembro()`. Existe también `es_admin(p_org)` (de `supabase_empresa.sql`).
- Las tablas hijas duplican `org_id` a propósito (evita subselects en policies y permite
  el `.eq("org_id", …)` defensivo). Precedente: `producto_precio`, `documento_empresa`.

## Storage

- Buckets **privados** `documentos` y `ordenes-oc` (`supabase_storage.sql`). Regla de oro:
  la ruta SIEMPRE empieza por el org: **`{org_id}/{scope}/{uuid}.{ext}`** — la policy usa
  `es_miembro(((storage.foldername(name))[1])::uuid)`.
- En BD se guarda el **path**, nunca la URL. Lectura por **`urlFirmada(bucket, path)`**
  (`src/lib/actions/storage.ts`, 10 min). Visor genérico: `src/components/VisorDocumento.tsx`
  (PDF/imagen/.eml en modal).
- Para licitaciones **no hace falta bucket nuevo**: `documentos` con ruta
  `{org_id}/licitaciones/{proceso_id}/…` ya queda autorizado por la policy existente.

## Conceptos existentes reutilizables (no crear de nuevo)

| Tabla | Qué es | Uso para licitaciones |
|---|---|---|
| `organizacion` + `miembro` | Tenancy | Tal cual |
| **`documento_empresa`** | Documentación legal de la empresa con **fecha de vencimiento**, semáforo (`nivelVencimiento`: ámbar 30d, rojo 15d) e insignia en el menú. En producción desde 2026-07-14 | Es la tabla `assets` que el borrador quería crear. Extender su catálogo de tipos con `firma` y `sello` |
| `institucion` | Entidades del Estado (`org_id`, nombre, siglas). Sin CRUD ni UI hoy; match por nombre desde la orden | Candidata a "entidades" — ver Decisión 3 |
| `suplidor` + `contacto` | Catálogo de suplidores con CRUD | Cotización: `lic_item.suplidor_id` |
| `producto_precio` (+ RPC `precios_buscar_full`) | Catálogo de precios de distribuidores, **costo en USD**, búsqueda full-text. Enlace estable por `(suplidor_id, sku)` — sobrevive re-importaciones | El cotizador de la oferta económica busca aquí (`buscarPreciosAction` ya existe) |
| `orden` + `item` | Post-adjudicación (OC → cobro) | El módulo termina donde esto empieza: evento `proceso.adjudicado` + FK `orden.proceso_id` |
| `empresa_perfil` | **NO existe.** `organizacion` solo tiene `{id, nombre, created_at}` — sin RNC, RPE ni representante | El snapshot `oferente` necesita crearla (estaba diseñada en el plan de Formularios previo) |

Utilidades transversales: `diasRestantes`/`nivelUrgencia`/`formatRD` (`src/lib/types.ts`),
`urgenciaChip`/`urgenciaDot`/`textoDias` (`src/lib/ui.ts`), `isDemo()` (`src/lib/demo.ts` —
**toda** función de datos abre con `if (isDemo()) return fixture`).

## Convención de módulos (seguirla exactamente)

Una herramienta = tres capas (precedente: Precios, el mejor ejemplo):

```
src/app/(app)/<herramienta>/     layout.tsx + _tabs.tsx + page.tsx + <Cliente>.tsx
src/lib/<herramienta>/           tipos.ts (puro) · queries.ts (isDemo→getMiembro→createClient)
src/lib/actions/<herramienta>.ts "use server", puente delgado + revalidatePath
src/app/api/<herramienta>/...    route handlers para archivos/procesos largos
supabase_<herramienta>.sql       SQL autocontenido y re-ejecutable
```

- Nav: una línea en `src/app/(app)/layout.tsx` (`<NavLink href="/licitaciones">`).
- UI compartida: `src/components/ui.tsx` (`Panel`, `SectionTitle`, `btnPrimary`,
  `btnGhost`, `inputBase`) + `lucide-react`. No hay `Chip`/`Modal` compartidos (hay copias
  locales; no bloquea).
- Mutaciones devuelven `string | null` (mensaje de error), no lanzan. CRUD de referencia:
  `grupos` (`src/lib/actions/grupos.ts`). **No** copiar `SuplidoresEditor.tsx` como
  arquitectura (no persiste, es resto del modo demo).

## Migraciones y tests

- **Migraciones:** archivos SQL en la raíz, corridos a mano (SQL Editor o Management API
  con aprobación). No hay framework de migraciones ni versionado — los archivos son
  re-ejecutables (`if not exists`, `create or replace`, bloques `do $$` con detección).
  Las migraciones incrementales van **al final del archivo canónico** de su herramienta.
- **Tests: no existen.** Ni runner ni script. Bootstrapear **vitest** es parte de la
  Fase 1. Verificación actual: `tsc --noEmit` + `eslint` + pruebas manuales/SQL directo.

## Frontera del módulo

- **Prefijo `lic_` obligatorio** en toda tabla nueva (`lic_proceso`, `lic_lote`,
  `lic_item`, `lic_requisito`, `lic_paquete`, `lic_capability`, `lic_firmante`,
  `lic_entidad_patron`, `lic_outbox`). Motivo: ya existen `item`, `orden`, `documento` —
  sin prefijo la confusión es garantizada.
- Código en `src/app/(app)/licitaciones/` + `src/lib/licitaciones/` +
  `src/lib/actions/licitaciones.ts` + `supabase_licitaciones.sql`.
- **Se reutiliza:** tenancy/RLS (`es_miembro`), storage (`documentos` +
  `{org_id}/licitaciones/…`), `documento_empresa`, `institucion`, `suplidor`,
  `producto_precio` + `buscarPreciosAction`, helpers de urgencia, UI kit, modo demo.
- **Se crea:** tablas `lic_*`, `empresa_perfil` (RNC/RPE/representante — diseño ya hecho
  en el plan de Formularios previo), schema Zod canónico, vitest, y el motor documental
  (arquitectura pendiente de la Decisión 2).

## Decisiones que requieren confirmación humana (bloquean fases)

1. ~~Firma: ¿imagen escaneada o certificado digital?~~ **RESUELTO (2026-07-14): imagen
   escaneada.** Estampado programático simple; `pdf-lib` (JS puro, corre en Vercel) cubre
   estampar imágenes y rellenar AcroForms.
2. **Formato de salida: ¿.docx oficiales rellenados, PDFs firmados, o mixto?** Decide la
   arquitectura del motor: .docx = docxtemplater en Vercel, cero infra nueva; PDF firmado =
   servicio aparte en contenedor (Railway/Fly/Cloud Run), token de servicio, costo propio.
   Si es mixto: empezar por la ruta .docx y añadir el servicio solo para lo que exija PDF.
3. **`entidades` compartidas entre tenants vs `institucion` org-scoped existente.**
   Opciones: (a) mantener `institucion` por org y compartir solo `lic_entidad_patron`
   global — mínimo cambio; (b) catálogo global nuevo con puente. Recomendación: **(a)**
   para no migrar datos vivos.
4. **`margen_modo` del cotizador: ¿markup (costo×1.30) o margen real (costo÷0.70)?**
   Pendiente desde el plan de Formularios. La diferencia es plata en cada oferta. El
   selector con ambos números en vivo está diseñado; falta la elección del default.
5. **Seed de capabilities:** confirmar la lista (sophos = blocker, autodesk/google =
   ninguno, resto partner) antes de sembrarla.

---

**Estado: Fase 0 entregada. Detenerse aquí — el plan exige revisión humana antes de la
Fase 1.**
