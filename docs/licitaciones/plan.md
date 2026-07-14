# Módulo de Licitaciones — Plan de trabajo

Guía **paso a paso** para integrar la gestión de licitaciones públicas (DGCP /
ComprasDominicana, Ley 47-25) dentro de adjudicado.app.

Regla de oro: **no es un proyecto nuevo, es un módulo que llega a convivir.** No asumir el
stack, no romper lo que funciona, no duplicar lo que ya existe (auth, tenancy, storage,
usuarios). Descubrir primero, acoplarse después.

Ejecutar las fases en orden. No avanzar a la siguiente sin cumplir el criterio de
aceptación de la actual.

> **Nota de revisión (2026-07-14).** Este plan viene de un borrador externo
> ([borrador-original.md](borrador-original.md)) revisado contra el repo real. Cambios respecto al
> borrador: (1) la tabla `assets` se elimina — ya existe `documento_empresa` en producción
> y se reutiliza/extiende; (2) los firmantes dejan de ser nombres propios hardcodeados y
> pasan a **roles** con mapeo por organización; (3) el prefijo `lic_` es **obligatorio** en
> toda tabla nueva (el borrador listaba `items`, que colisiona mentalmente con la tabla
> `item` existente); (4) se injerta el **cotizador** (catálogo Precios: costo USD → tasa →
> margen → ITBIS → DOP) que el borrador omitía y el negocio pidió; (5) el formato de salida
> (.docx oficial vs PDF firmado) queda como **decisión bloqueante explícita** antes de la
> Fase 4; (6) `entidades` compartida entre tenants debe reconciliarse con la tabla
> `institucion` existente; (7) el repo no tiene infraestructura de tests — bootstrapearla
> es parte de la Fase 1.

---

## Contexto de negocio

La empresa participa en compras públicas dominicanas. El dolor #1 es **armar y firmar el
paquete de documentos** de cada licitación: es lento, y como la firma es un "punto de no
retorno", cualquier cambio de último minuto obliga a rehacer todo a mano. Eso empuja a
armar tarde, y armar tarde ya causó una descalificación real por entregar un documento
no-subsanable incompleto.

**Meta del módulo:** que generar el paquete completo, firmado y sellado, cueste segundos y
sea repetible. Que sea **imposible** generar un paquete incompleto.

Conceptos del dominio:

- **Proceso / expediente:** una licitación. Código, entidad convocante, cronograma con
  fecha de cierre, moneda, criterio de adjudicación.
- **Ítem:** cada bien/servicio pedido. El pliego lo describe con un `spec` (a veces sin
  marca). La empresa decide qué producto real oferta.
- **Requisito:** documento o formulario a entregar. Cada uno es **subsanable** (se puede
  corregir después) o **no-subsanable** (si falta o está mal, descalifican). Este flag
  manda sobre todo lo demás.
- **Paquete:** el ZIP final de documentos firmados que se sube al portal.

---

## FASE 0 — Descubrimiento del sistema existente

Producir `docs/licitaciones/00-hallazgos.md` respondiendo: framework, base de datos,
autenticación, multi-tenancy, RLS, storage, conceptos reutilizables, convención de
módulos, UI compartida, migraciones y tests. Al final: la **frontera del módulo** (qué se
reutiliza vs qué se crea) y las **decisiones que requieren confirmación humana**.

> Estado: gran parte ya está verificado por el trabajo de los días previos sobre este
> mismo repo (documentación de empresa, buscador de Precios, precios de ítems). La Fase 0
> consiste en consolidarlo por escrito, no en explorar a ciegas.

**Criterio de aceptación:** el documento existe, responde todo, define la frontera.
**Parada obligatoria: revisión humana antes de la Fase 1.**

---

## FASE 1 — El contrato de datos (JSON canónico)

Antes de tablas y UI, definir **la estructura canónica de un proceso**. Es el contrato que
todo lo demás consume.

1. Schema con **Zod** (TypeScript — es lo que usa el repo), en `src/lib/licitaciones/`.
   Bootstrapear **vitest** para los tests del schema (el repo no tiene runner; es parte de
   esta fase).

2. Estructura canónica:
   - `meta`: `id`, `org_id`, `version` (int, sube en cada generación), `generado_en`.
   - `proceso`: `codigo`, `modalidad` (CM|CD|LPN|CP|SB|OTRO), `objeto`, `entidad`
     {nombre, siglas, direccion?}, `cronograma` {publicacion?, aclaraciones?, `cierre`
     (fecha+hora, obligatorio), apertura_tecnica?, apertura_economica?}, `moneda`
     (DOP|USD), `plazo_pago_dias?`, `adjudicacion` (item|lote|total), `criterio`
     (menor_precio|calidad_precio|calidad).
   - `oferente`: **snapshot** de los datos de la empresa al momento de generar
     (razon_social, rnc, rpe, direccion, telefono, email). Copia, no referencia viva: los
     paquetes viejos no cambian si mañana cambian los datos de la empresa.
   - `firmantes`: mapeo de **roles** a personas, resuelto por organización al momento del
     snapshot: {rol: 'gerente_general'|'gerente_ventas', nombre, cedula?, cargo}. **Nunca
     nombres propios en el contrato ni en enums** — esto se vende a otros proveedores.
   - `lotes[]`: {numero, nombre?, `items[]`}.
     - `item`: {numero, `spec_cruda` (texto TAL CUAL del pliego, **nunca se edita ni
       normaliza** — es evidencia legal), cantidad, unidad, `producto`? {marca, modelo,
       parte?, descripcion (redacción afirmativa)}, `ofertamos` (bool), motivo_descarte?}.
   - `requisitos[]`: {codigo, nombre, `subsanable` (bool, **default false** — fail-safe:
     ante la duda es crítico), fuente?, `firmante_rol` (gerente_general|gerente_ventas|
     ninguno), `origen` (generado|plantilla_oficial|documento_empresa|externo), `estado`
     (pendiente|listo), documento_empresa_id?, storage_path?}.
   - `economico`?: {itbis_pct (default 18), `lineas[]`}. Cada línea lleva el **cotizador
     congelado** (mismo diseño que el plan de Formularios previo):
     {item, lote?, `suplidor_id?`, `sku?` (enlace estable al catálogo de Precios — el par
     sobrevive re-importaciones), `costo_usd?`, `tasa?`, `margen_pct?`, `margen_modo?`
     (markup|margen), `precio_unitario` (DOP, venta, SIN ITBIS), `itbis_aplica` (bool)}.
     El snapshot es inmutable: regenerar el paquete en 3 semanas produce el mismo papel;
     recalcular con tasa nueva es un acto explícito, nunca implícito.

3. Reglas duras (documentarlas como comentarios en el schema): `spec_cruda` inmutable ·
   `subsanable` default false · `oferente` y cotizador son snapshot, no join.

4. Tests: un caso válido completo; casos que deben fallar (cierre sin hora, requisito sin
   firmante_rol, item sin spec_cruda, línea económica con precio negativo).

**Criterio de aceptación:** el schema valida un proceso real de ejemplo y rechaza los
inválidos.

---

## FASE 2 — Persistencia (acoplada al tenancy existente)

Archivo `supabase_licitaciones.sql` autocontenido y re-ejecutable (convención del repo),
**prefijo `lic_` obligatorio en toda tabla** (el repo ya tiene `item`; un `items` sin
prefijo es confusión garantizada).

1. Tablas:
   - `lic_proceso` (org_id, institucion_id?, codigo, modalidad, objeto, moneda,
     adjudicacion, criterio, plazo_pago_dias, cierre timestamptz, estado, timestamps).
     `estado`: captura|calificacion|costeo|armado|listo|sometido|subsanacion|adjudicado|
     perdido|descartado. `unique(org_id, codigo)`.
   - `lic_lote` (proceso_id, numero, nombre).
   - `lic_item` (proceso_id, lote_id?, numero, spec_cruda, cantidad, unidad, marca?,
     modelo?, parte?, descripcion?, ofertamos, motivo_descarte?, y el cotizador congelado:
     suplidor_id?, sku?, costo_usd?, tasa?, margen_pct?, margen_modo?, precio_unitario?,
     itbis_aplica).
   - `lic_requisito` (proceso_id, codigo, nombre, subsanable **default false**, fuente?,
     firmante_rol default 'gerente_general', origen, estado default 'pendiente',
     documento_empresa_id? → **referencia a `documento_empresa`, NO tabla nueva**,
     storage_path?).
   - `lic_paquete` (proceso_id, version, payload jsonb, payload_hash, storage_path,
     generado_por, generado_at). `unique(proceso_id, version)`.
   - `lic_capability` (org_id, vendor, estado: partner|canal|ninguno|blocker, nota).
   - `lic_firmante` (org_id, rol unique por org, nombre, cedula?, cargo, firma_asset?
     → referencia a `documento_empresa` tipo 'firma'/'sello').
   - `lic_entidad_patron` (institucion_id, org_id NULL-able, clave, valor jsonb, nota,
     confianza) — memoria institucional; `org_id NULL` = patrón global compartido.
   - **NO se crea `assets`**: es `documento_empresa` (ya en producción, con vencimientos
     e insignia). Se extiende su catálogo de tipos con `firma` y `sello`.
   - **`entidades`: decisión pendiente** (ver Fase 0). El repo tiene `institucion`
     org-scoped; el catálogo compartido entre tenants exige puentear o migrar. No crear
     nada hasta decidirlo.

2. Aislamiento: RLS con `es_miembro(org_id)` — el mismo helper que usa todo el repo.
   Tablas hijas con `org_id` propio duplicado (como hace `oferta_linea` en el plan previo
   y `proceso_formulario`) para evitar subselects en las policies.

3. **Separación público/privado** (esto se venderá a otros proveedores): lo público
   (entidades, patrones globales, specs de pliegos) puede compartirse; lo privado (costos,
   precios, márgenes, capabilities, resultados) **nunca** sale del tenant.

4. Seed del tenant principal: capabilities (microsoft, adobe, veeam, fortinet, kaspersky,
   lenovo, zoom, manageengine = partner; **sophos = blocker**; autodesk, google = ninguno)
   y los firmantes por rol.

5. Test de aislamiento: un usuario del tenant A no lee ni una fila de lic_* del tenant B.

**Criterio de aceptación:** migración corre limpia sin tocar tablas ajenas; test de
aislamiento pasa.

---

## FASE 3 — Captura manual y la "Bid Room"

UI para cargar un expediente a mano y verlo completo. **Sin parser automático de pliegos**
(fase futura); la captura manual valida todo el módulo.

1. CRUD de proceso con el design system del repo (`src/components/ui.tsx`, patrón de
   herramienta con pestañas como Precios): cabecera → lotes → ítems → requisitos.
2. **Bid Room**: una pantalla por proceso — cronograma con cuenta regresiva al cierre
   (reusar `diasRestantes`/`urgenciaChip`), ítems, **checklist de requisitos con el flag
   subsanable bien visible**, estado del proceso.
3. Subida de archivos por requisito (mecanismo de storage existente, ruta
   `{org_id}/licitaciones/{proceso_id}/…`). El archivo sube → el requisito pasa a `listo`.
4. Endpoint que devuelve el **JSON canónico** validado (lo que consumirá el motor).
5. Cotizador en los ítems: buscar en el catálogo de Precios (server action
   `buscarPreciosAction` ya existente) → costo USD → tasa/margen/ITBIS → precio DOP,
   congelado en la línea. Líneas manuales sin catálogo desde el día 1.

**Criterio de aceptación:** cargar a mano un expediente real completo en ~20 min y obtener
por el endpoint un JSON canónico válido.

---

## FASE 4 — Motor documental

El núcleo del valor: convertir el JSON canónico en el paquete final.

> ⚠️ **BLOQUEO — confirmar antes de codificar:**
> 1. ~~¿Firma imagen escaneada o certificada?~~ **RESUELTO (2026-07-14, Pablo): imagen
>    escaneada.** El estampado programático es válido y simple. Consecuencia técnica:
>    estampar imágenes y rellenar formularios PDF (AcroForm) lo hace `pdf-lib` (JS puro,
>    corre en Vercel) — el servicio aparte solo sería necesario para render HTML→PDF de
>    documentos propios, no para los formularios oficiales ni la firma.
> 2. **¿Qué exige el portal al subir: .docx oficiales rellenados, o PDFs firmados?** Esta
>    respuesta decide la arquitectura: **.docx** = docxtemplater, JS puro, corre en Vercel
>    hoy, cero infraestructura nueva (decisión del plan de Formularios previo); **PDF
>    firmado** = servicio HTTP aparte (contenedor con render HTML→PDF y manipulación de
>    PDF, que no corre en serverless), token de servicio, deploy y costo propios.
>    Es plausible que la respuesta sea "ambos según el documento" — en ese caso, empezar
>    por la ruta .docx (barata) y añadir el servicio PDF solo para lo que lo exija.

Si hay servicio aparte: HTTP **sin estado**, no habla con la base de datos, un endpoint
`POST /generar` que recibe `{proceso: <JSON canónico>, assets: {…urls firmadas…}}` y
devuelve archivos; token de servicio compartido.

Dos rutas de generación:

1. **Documentos propios** (oferta técnica, cartas): si existe el generador editorial de la
   empresa (HTML→PDF), **reusarlo** envuelto como servicio. Convenciones: voz afirmativa,
   sin tablas "Cumple/No Cumple", **sin precios en la oferta técnica** (los precios van
   solo en la económica).
2. **Formularios oficiales** (SNCC.F.033, F.034, F.042, D.045…): **no regenerar con diseño
   propio** — el portal exige el formato oficial. Registro de plantillas: por formulario,
   el original + un mapa de campos → variables del JSON canónico. Empezar por los 4 más
   usados.

Firma y sello por **rol** (de `lic_firmante` de la org): gerente_general firma ofertas
técnicas y todo requisito no-subsanable; gerente_ventas firma comerciales y subsanables.

Empaquetado: nombres `{codigo}_{documento}_v{version}`, carátula/índice, ZIP.
**Idempotencia:** el mismo JSON produce siempre el mismo paquete; cambiar un dato sube
`version` y regenera todo en segundos. `lic_paquete` guarda payload exacto y hash.

**Criterio de aceptación:** un expediente real produce un paquete equivalente al manual en
<60 s; regenerarlo tras cambiar un precio toma lo mismo.

---

## FASE 5 — El gate de no-subsanables

La razón de ser del módulo: **hacer imposible entregar un paquete incompleto.**

1. Bloqueo duro: "Generar paquete" **deshabilitado** si existe requisito con
   `subsanable = false` y `estado = 'pendiente'`. No es warning ni "acepto el riesgo".
2. En la Bid Room, contador rojo con los no-subsanables pendientes, cada uno con su
   `fuente` (dónde lo exige el pliego).
3. Cruce de capabilities: al asignar `marca` a un ítem, comparar el vendor contra
   `lic_capability`. Si `blocker` o `ninguno` → ítem en rojo, sugerir `ofertamos = false`.
4. Assets vencidos: si un `documento_empresa` requerido (RPE, DGII, TSS) está vencido
   (**ya se calcula** — `nivelVencimiento`), avisar antes de permitir generar.

**Criterio de aceptación:** reproducir el caso de la descalificación pasada (un
no-subsanable faltante) y verificar que el sistema **bloquea** la generación.

---

## FASE 6 — Punto de extensión hacia el resto del sistema

1. Mecanismo `lic_outbox` (org_id, evento, payload, procesado_at).
2. Al pasar un proceso a `adjudicado`, emitir `proceso.adjudicado` con ítems y precios
   cerrados. **No** implementar el consumidor todavía — la parte post-adjudicación
   (crear la `orden` desde el proceso, sembrar `item` desde las líneas) lo consumirá
   después. Complemento barato: FK opcional `orden.proceso_id` para el enlace directo.

**Criterio de aceptación:** marcar adjudicado registra el evento; el resto del sistema no
se ve afectado.

---

## Qué NO hacer (límites)

- **No** construir parser automático de pliegos PDF ni descarga del ZIP del portal (fase
  futura; la captura manual valida todo primero).
- **No** automatizar la subida al portal DGCP (frágil y riesgoso).
- **No** reimplementar auth, tenancy, storage ni design system.
- **No** duplicar `documento_empresa` con una tabla `assets`.
- **No** hardcodear nombres de personas en schemas ni enums — roles siempre.
- **No** tocar contabilidad/facturación — el módulo solo emite el evento.
- **No** codificar el estampado de firma sin las dos confirmaciones de la Fase 4.
- **No** avanzar de fase sin cumplir el criterio de aceptación.

---

## Orden de ejecución

| Fase | Entregable | Bloqueo/Aceptación |
|---|---|---|
| 0 | `00-hallazgos.md` + frontera del módulo | **Revisión humana antes de seguir** |
| 1 | Schema canónico (Zod) + vitest + tests | Valida ejemplo real, rechaza inválidos |
| 2 | `supabase_licitaciones.sql` (prefijo `lic_`) + aislamiento | Test de aislamiento pasa |
| 3 | Captura manual + Bid Room + endpoint canónico + cotizador | Expediente real en ~20 min |
| 4 | Motor documental | **Confirmar firma y formato ANTES**; paquete <60 s, idempotente |
| 5 | Gate de no-subsanables | Bloquea el caso de la descalificación pasada |
| 6 | Evento de salida | Evento emitido, resto intacto |
