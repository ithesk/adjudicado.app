# Módulo de Licitaciones — Plan de trabajo para el agente

Este documento es una guía **paso a paso** para integrar un módulo de gestión de licitaciones públicas (DGCP / ComprasDominicana) dentro de un sistema SaaS multi-tenant **que ya existe parcialmente**.

Regla de oro de este plan: **no eres un proyecto nuevo, eres un módulo que llega a convivir.** No asumas el stack, no rompas lo que funciona, no dupliques lo que ya existe (auth, tenancy, storage, usuarios). Descubre primero, acóplate después.

Ejecuta las fases en orden. No avances a la siguiente hasta cumplir el criterio de aceptación de la actual.

---

## Contexto de negocio (para que entiendas qué construyes)

La empresa participa en compras públicas dominicanas bajo Ley 47-25. El proceso hoy está fragmentado entre varias herramientas y trabajo manual. El dolor #1 es **armar y firmar el paquete de documentos** de cada licitación: es lento, y como la firma es un "punto de no retorno", cualquier cambio de último minuto obliga a rehacer todo a mano. Eso empuja a armar tarde, y armar tarde ya causó una descalificación real por entregar un documento no-subsanable incompleto.

**Meta del módulo:** que generar el paquete completo, firmado y sellado, cueste segundos y sea repetible. Que sea imposible generar un paquete incompleto.

Conceptos del dominio que vas a modelar:
- **Proceso / expediente:** una licitación. Tiene código, entidad convocante, cronograma con fecha de cierre, moneda, criterio de adjudicación.
- **Ítem:** cada bien/servicio pedido. El pliego lo describe con un `spec` (a veces sin marca). La empresa decide qué producto real oferta.
- **Requisito:** documento o formulario que hay que entregar. Cada uno es **subsanable** (se puede corregir después) o **no-subsanable** (si falta o está mal, descalifican). Este flag manda.
- **Paquete:** el ZIP final de PDFs firmados que se sube al portal.

---

## FASE 0 — Descubrimiento del sistema existente

**No escribas código de negocio todavía.** Tu primer trabajo es entender lo que ya hay y producir un documento de hallazgos. Un módulo que asume mal el entorno hace más daño que uno que no existe.

Pasos:

1. Recorre el repositorio y responde por escrito, en `docs/licitaciones/00-hallazgos.md`:
   - ¿Qué framework y lenguaje usa la app? (Next.js, Rails, Laravel, etc.)
   - ¿Qué base de datos y qué ORM/query builder?
   - ¿Cómo está resuelta la **autenticación**? ¿Y el **multi-tenancy**? Busca cómo se identifica el tenant actual (columna `org_id`/`tenant_id`, subdominio, claim del JWT, middleware). **Esto lo reutilizas, no lo reinventas.**
   - ¿Hay Row Level Security o el aislamiento es a nivel de aplicación?
   - ¿Cómo se manejan los archivos/uploads hoy? (S3, Supabase Storage, disco, etc.)
   - ¿Existe ya algún concepto de "cliente", "cotización", "producto", "proveedor"? Lista las tablas relevantes. Quizás puedas **referenciar** algunas en vez de crear nuevas.
   - ¿Cómo se organizan los módulos/features en el código? (carpeta por feature, monolito por capas, paquetes). El módulo de licitaciones debe seguir esa misma convención.
   - ¿Hay una capa de UI compartida (design system, componentes)? Úsala.
   - ¿Cómo se corren migraciones y tests?

2. Al final del documento, propón la **frontera del módulo**: qué namespace/carpeta/prefijo de tablas usará (sugerencia: prefijo `lic_` o esquema `licitaciones`), y qué del sistema existente vas a **reutilizar** vs **crear nuevo**.

3. Marca explícitamente cualquier decisión que requiera confirmación humana antes de continuar (por ejemplo: "el sistema no tiene RLS, ¿aíslo por aplicación como el resto?").

**Criterio de aceptación:** `docs/licitaciones/00-hallazgos.md` existe, responde todas las preguntas de arriba, y define la frontera del módulo. **Detente aquí y espera revisión humana antes de la Fase 1.**

---

## FASE 1 — El contrato de datos (JSON canónico)

Antes de tablas y UI, define **la estructura canónica de un proceso**. Es el contrato que todo lo demás consume. Si esto se define bien, el resto se acopla solo.

Pasos:

1. Crea el schema en el lenguaje/validador que ya use el proyecto (Zod si es TS, Pydantic si es Python, dry-schema si es Ruby, etc. — **usa lo que el sistema ya tiene**). Ubícalo donde vivan los tipos compartidos.

2. La estructura canónica es esta (adáptala a la sintaxis del proyecto, no cambies los campos):

   - `meta`: `id`, `org_id` (el identificador de tenant que descubriste en Fase 0), `version` (int, sube en cada generación), `generado_en`.
   - `proceso`: `codigo`, `modalidad` (CM|CD|LPN|CP|SB|OTRO), `objeto`, `entidad` {nombre, siglas, direccion?}, `cronograma` {publicacion?, aclaraciones?, `cierre` (fecha+hora, obligatorio), apertura_tecnica?, apertura_economica?}, `moneda` (DOP|USD), `plazo_pago_dias?`, `adjudicacion` (item|lote|total), `criterio` (menor_precio|calidad_precio|calidad).
   - `oferente`: **snapshot** de los datos de la empresa al momento de generar (razon_social, rnc, rpe, direccion, telefono, email). Es una copia, no una referencia viva: los paquetes viejos no deben cambiar si mañana cambian los datos de la empresa.
   - `lotes[]`: {numero, nombre?, `items[]`}.
     - `item`: {numero, `spec_cruda` (texto TAL CUAL del pliego, **nunca se edita ni normaliza**), cantidad, unidad, `producto`? {marca, modelo, parte?, descripcion (redacción afirmativa)}, `ofertamos` (bool), motivo_descarte?}.
   - `requisitos[]`: {codigo, nombre, `subsanable` (bool), fuente?, `firmante` (pablo_gg|alejandra|ninguno), `origen` (generado|plantilla_oficial|asset|externo), `estado` (pendiente|listo), asset_id?}.
   - `economico`?: {itbis_pct (default 18), `lineas[]` {item, precio_unitario, itbis_aplica}}.

3. Reglas duras del contrato (documéntalas como comentarios en el schema):
   - `spec_cruda` es evidencia legal de lo que pidió la entidad → inmutable.
   - Si no se sabe si un requisito es subsanable, por defecto `false` (fail-safe: tratarlo como crítico).
   - `oferente` es snapshot, no join.

4. Escribe tests unitarios del schema: un caso válido completo, y casos que deben fallar (cierre sin hora, requisito sin firmante, item sin spec_cruda).

**Criterio de aceptación:** el schema valida un proceso real de ejemplo y rechaza los casos inválidos. Sin UI, sin tablas todavía.

---

## FASE 2 — Persistencia (acoplada al tenancy existente)

Crea las tablas del módulo **respetando el mecanismo de multi-tenancy que descubriste en Fase 0**. No inventes un tenancy nuevo.

Pasos:

1. Crea las migraciones con el prefijo/esquema definido en la frontera del módulo. Tablas:
   - `procesos` (org_id, entidad_id, codigo, modalidad, objeto, moneda, adjudicacion, criterio, plazo_pago_dias, cierre, estado, timestamps). `estado`: captura|calificacion|costeo|armado|listo|sometido|subsanacion|adjudicado|perdido|descartado. `unique(org_id, codigo)`.
   - `lotes` (proceso_id, numero, nombre).
   - `items` (proceso_id, lote_id?, numero, spec_cruda, cantidad, unidad, marca?, modelo?, parte?, descripcion?, ofertamos, motivo_descarte?, precio_unitario?, itbis_aplica).
   - `requisitos` (proceso_id, codigo, nombre, subsanable **default false**, fuente?, firmante default 'pablo_gg', origen, estado default 'pendiente', asset_id?, storage_path?).
   - `paquetes` (proceso_id, version, payload jsonb, payload_hash, storage_path, generado_por, generado_at). `unique(proceso_id, version)`.
   - `capabilities` (org_id, vendor, estado: partner|canal|ninguno|blocker, nota) — qué vendors puede ofertar el tenant.
   - `assets` (org_id, tipo, nombre, storage_path, vence_el?, meta) — documentos reutilizables del tenant: RPE, DGII, TSS, cartas de fabricante, imagen de firma, sello.
   - `entidades` (nombre, siglas unique, direccion?) — **catálogo compartido entre tenants**, sin org_id.
   - `entidad_patrones` (entidad_id, org_id NULL-able, clave, valor jsonb, nota, confianza) — memoria institucional: p.ej. "en tal entidad la carta de fabricante es no-subsanable". `org_id NULL` = patrón global.

2. Aplica el aislamiento por tenant **de la misma forma que el resto del sistema**:
   - Si el sistema usa RLS → escribe policies `org_isolation` para todas las tablas con `org_id`.
   - Si el sistema aísla por aplicación → usa el mismo helper/scope que ya existe (no consultes sin filtrar por tenant nunca).
   - `entidades` y `entidad_patrones` con `org_id NULL` son lectura compartida entre tenants.

3. **Separación de datos público/privado** (importante porque esto se venderá a otros proveedores): lo público (procesos, entidades, patrones institucionales, specs de pliegos) puede compartirse entre tenants; lo privado (costos, precios, márgenes, capabilities, cotizaciones, resultados) **nunca** sale del tenant. No mezcles ambos en una tabla sin `org_id`.

4. Seed inicial del tenant principal:
   - `capabilities`: microsoft, adobe, veeam, fortinet, kaspersky, lenovo, zoom, manageengine = `partner`; **sophos = blocker**; autodesk, google = `ninguno`.
   - Algunas `entidades` conocidas.

5. Escribe un test que **pruebe el aislamiento**: un usuario del tenant A no puede leer ni una fila de procesos/items/assets del tenant B.

**Criterio de aceptación:** las migraciones corren limpio sobre la base existente sin tocar tablas ajenas, y el test de aislamiento pasa.

---

## FASE 3 — Captura manual y la "Bid Room"

UI para cargar un expediente a mano y verlo completo. Aún **no** hay parser automático de pliegos — eso es una fase futura. La captura manual es suficiente para validar todo el módulo.

Pasos:

1. CRUD de proceso usando los componentes/design system existentes: cabecera → lotes → ítems → requisitos.
2. Vista "Bid Room": una pantalla por proceso que muestra en un solo lugar: cronograma con cuenta regresiva al cierre, lista de ítems, **checklist de requisitos con su flag subsanable bien visible**, y estado del proceso.
3. Subida de archivos por requisito, usando el mecanismo de storage existente. El archivo subido marca el requisito como `listo`.
4. Endpoint que devuelve el **JSON canónico** del proceso (validado con el schema de Fase 1). Este endpoint es lo que consumirá el motor documental.

**Criterio de aceptación:** cargar a mano un expediente real completo en menos de ~20 min y obtener por el endpoint un JSON canónico válido.

---

## FASE 4 — Motor documental (servicio separado)

Este es el núcleo del valor: convertir el JSON canónico en el paquete de PDFs firmados. **Debe ser un servicio aparte**, no código dentro de la app web, porque necesita procesos largos y binarios pesados (renderizado HTML→PDF y manipulación de PDF) que no corren bien en entornos serverless.

Arquitectura:
- Servicio HTTP **sin estado**. **No habla con la base de datos.** Recibe un JSON + los assets necesarios (imagen de firma, sello) y devuelve archivos. Esto lo hace testeable y desechable.
- Un solo endpoint: `POST /generar` → recibe `{ proceso: <JSON canónico>, assets: {...urls firmadas...} }`, devuelve `{ archivos: [...], zip: <bytes> }`.
- Se autentica con un token de servicio compartido con la app.

Dos rutas de generación:

1. **Documentos propios** (oferta técnica, carta de presentación, oferta económica): render HTML→PDF con plantillas de marca. Si ya existe en la empresa un generador de ofertas técnicas (HTML→PDF), **reúsalo**: envuélvelo como servicio en vez de reescribirlo. Convenciones a respetar: voz afirmativa, sin tablas de "Cumple/No Cumple", y **sin precios en la oferta técnica** (los precios van solo en la oferta económica).

2. **Formularios oficiales** (SNCC.F.033, F.034, F.042, D.045, etc.): **no los regeneres con diseño propio** — el portal exige el formato oficial. Crea un registro de plantillas: por cada formulario, el PDF original + un `map.json` que mapea cada campo del formulario a una variable del JSON canónico. Rellena programáticamente: si el PDF tiene campos de formulario (AcroForm), llénalos por nombre; si no, superpón texto por coordenadas. Empieza por los 4 más usados.

Estampado de firma y sello — **regla de firmante** (parte del dominio):
- Firmante "pablo_gg" (Gerente General): todas las ofertas técnicas + todo requisito con `subsanable = false`.
- Firmante "alejandra" (Gerente de Ventas): documentos comerciales y subsanables.
- El servicio sabe el tipo de cada documento, así que sabe quién firma. Estampa la imagen de firma + sello en coordenadas de plantilla o ancladas por búsqueda de texto ("Firma:", "Sello:").

> ⚠️ **BLOQUEO — requiere confirmación humana antes de codificar el estampado:** hay que confirmar si la firma actual es una **imagen escaneada estampada** o una **firma digital certificada** (PAdES con certificado reconocido). Si es imagen, el estampado programático es equivalente y simple. Si es certificada, hay que integrar el certificado por PKCS#11 y el alcance cambia. **No implementes este submódulo hasta tener la respuesta.**

Empaquetado:
- Nombra los archivos consistente: `{codigo}_{documento}_v{version}.pdf`.
- Genera una carátula/índice del paquete.
- Empaqueta en ZIP.
- **Idempotencia:** el mismo JSON canónico debe producir siempre el mismo paquete. Si cambia un dato, se incrementa `version` y se regenera todo (incluidas firmas) en segundos. Guarda en `paquetes` el `payload` exacto y su `payload_hash`.

**Criterio de aceptación:** un expediente real produce un paquete equivalente al que hoy se arma a mano, en menos de 60 s. Regenerarlo tras cambiar un precio toma lo mismo.

---

## FASE 5 — El gate de no-subsanables

Es la funcionalidad de mayor valor y la razón de ser del módulo: **hacer imposible entregar un paquete incompleto.**

Pasos:

1. Bloqueo duro: el botón/acción "Generar paquete" está **deshabilitado** si existe algún requisito con `subsanable = false` y `estado = 'pendiente'`. No es un warning ni un "acepto el riesgo". Es un bloqueo.
2. En la Bid Room, muestra arriba un contador rojo con los no-subsanables pendientes, cada uno con su `fuente` (dónde en el pliego se exige).
3. Cruce de capabilities: al asignar `marca` a un ítem, compara el vendor contra `capabilities` del tenant. Si está en `blocker` o `ninguno`, marca el ítem en rojo y sugiere `ofertamos = false` con el motivo.
4. Alerta de assets vencidos: si un `asset` requerido (RPE, DGII, TSS) tiene `vence_el` en el pasado, avisa antes de permitir generar.

**Criterio de aceptación:** intenta reproducir el caso de la descalificación pasada (un no-subsanable faltante) y verifica que el sistema **bloquea** la generación.

---

## FASE 6 — Punto de extensión hacia el sistema existente

No integres flujos externos todavía; solo deja el enganche limpio.

Pasos:

1. Crea una tabla/mecanismo `outbox` (org_id, evento, payload, procesado_at) o usa el bus de eventos que ya tenga el sistema.
2. Cuando un proceso pasa a `estado = 'adjudicado'`, emite un evento `proceso.adjudicado` con los ítems y precios cerrados. **No** implementes el consumidor todavía — solo deja el evento disponible para que la parte post-adjudicación (órdenes de compra, facturación) lo consuma después.

**Criterio de aceptación:** al marcar un proceso como adjudicado se registra el evento con su payload; el resto del sistema no se ve afectado.

---

## Qué NO hacer (límites del módulo)

- **No** construyas parser automático de pliegos PDF ni descarga del ZIP del portal en estas fases. La captura manual valida todo primero. (Fase futura.)
- **No** automatices la subida al portal DGCP (frágil y riesgoso).
- **No** reimplementes auth, tenancy, storage ni el design system — reutiliza los del sistema existente.
- **No** toques la contabilidad ni la facturación — eso vive en la parte post-adjudicación del sistema; el módulo solo emite el evento.
- **No** metas el motor documental dentro de la app web — va como servicio aparte.
- **No** avances de fase sin cumplir el criterio de aceptación.
- **No** codifiques el estampado de firma sin la confirmación de firma imagen vs. certificada.

---

## Orden de ejecución resumido

| Fase | Entregable | Bloqueo/Aceptación |
|---|---|---|
| 0 | Documento de hallazgos + frontera del módulo | Revisión humana antes de seguir |
| 1 | Schema canónico + tests | Valida ejemplo real, rechaza inválidos |
| 2 | Migraciones + aislamiento por tenant | Test de aislamiento pasa; no toca tablas ajenas |
| 3 | Captura manual + Bid Room + endpoint canónico | Expediente real cargado en ~20 min |
| 4 | Motor documental (2 rutas + estampado) | Paquete real en <60 s, idempotente. Firma: confirmar antes |
| 5 | Gate de no-subsanables | Bloquea el caso de descalificación pasada |
| 6 | Evento de salida hacia post-adjudicación | Evento emitido, resto intacto |

Empieza por la Fase 0. No escribas código de negocio hasta entregar el documento de hallazgos.
