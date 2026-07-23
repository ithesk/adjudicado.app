# Bitácora de trabajo

Registro de cada tramo de trabajo sobre el proyecto. Sirve como respaldo del contexto:
si se pierde la sesión, la máquina o pasan semanas, aquí está en qué íbamos y por qué.

**Convención:** entrada nueva **al tope** (lo más reciente primero). Cada entrada dice qué
se hizo, qué quedó pendiente y las decisiones no obvias (las obvias ya están en el código).

---

## 2026-07-23 (5) — Odoo: VINCULAR factura (las facturas reales no llevan la OC)

Pablo conectó su Odoo real (ventas.innovaciontecnologica.com.do, Odoo 17;
el error de credenciales era la API key — entra con Google/2FA; la tabla la
creé yo vía Management API con su token, guardado en .env.local a pedido
suyo). Al probar con la orden OGTIC-2026-00057: la búsqueda por OC no
encuentra NADA porque sus facturas en Odoo no llevan el número de OC
(invoice_origin trae el nº de cotización tipo CS089…, o va vacío).

Solución: **vincular una vez, seguir por id**:
- `listarFacturasRecientes()` + `leerFacturasPorId()` en lib/odoo.ts.
- Actions `listarFacturasOdoo()` y `vincularFacturaOdoo(ordenId, facturaId)`
  (guarda id+estado+nombre, evento en bitácora); `sincronizarFacturaOdoo`
  refresca por id si hay vínculo, si no intenta por OC como antes.
- OdooSync UI: «Elegir factura de Odoo…» → lista de las 15 recientes
  (INV/… · monto · cliente · fecha · estado) → clic vincula; vinculada
  muestra chip + nombre + «Actualizar estado» + «Cambiar factura…».
- Cron: las vinculadas se refrescan POR ID en una sola llamada; las sueltas
  siguen intentando por OC. Columna nueva `orden.odoo_factura_nombre`
  (migración corrida en prod y anexada a supabase_integraciones.sql).

## 2026-07-23 (4) — Odoo por EMPRESA: botón «Conectar con Odoo»

**Iteración friendly (mismo día)**: Pablo quería flujo tipo OAuth (redirigir
y autorizar, como Claude↔Gmail). Odoo estándar NO tiene servidor de
autorización al cual redirigir (su API solo autentica usuario+clave), así
que se construyó lo más cercano: asistente de DOS pasos — (1) solo la URL →
`descubrirServidor()` detecta versión y bases (`db.list`; en odoo.com,
sugerencia por subdominio); (2) usuario + contraseña O API key (la API
acepta ambas; con 2FA hace falta la key). Verificado contra Odoo públicos
(runbot 19.0, odoo.com saas). El paso de URL normaliza (agrega https://).

Pablo pidió algo friendly: nada de variables universales — cada empresa
conecta su Odoo desde el menú con un botón. Hecho completo:

- **`supabase_integraciones.sql`** (⚠️ CORRER EN SUPABASE): tabla
  `integracion_odoo` (una fila por org: url, db, usuario, api_key_cifrada,
  activo, version/probado_at) con RLS es_miembro.
- **Cifrado**: `src/lib/cifrado.ts` — AES-256-GCM; llave derivada de
  `CREDENCIALES_SECRET` (env del sistema, generada en .env.local; agregar en
  Vercel). La API key nunca viaja al navegador ni se guarda en claro.
- **`lib/odoo.ts` refactorizado**: todas las funciones reciben `OdooConfig`
  como parámetro; `configDesdeEnv()` queda como modo legado.
  `lib/odoo-config.ts`: `obtenerConfigOdoo(supabase, orgId)` (cuenta de la
  org → env → null; llave rota NO cae al env de otra empresa) y
  `estadoIntegracionOdoo` (lo mostrable, sin api key).
- **Flujo «Conectar con Odoo»** (Configuración → Integraciones,
  `ConexionOdoo.tsx`): botón → form (url/db/usuario/api key) → se PRUEBA la
  conexión ANTES de guardar (si falla, no se guarda nada) → tarjeta verde
  «Conectado a <db> — Odoo <versión> · probado <fecha>» con Probar y
  Desconectar. El modo legado por env se muestra como tal con botón para
  migrar a cuenta propia. ProbarOdooBtn eliminado.
- **Cron multi-empresa**: recorre las orgs con cuenta activa (cada una
  contra SU Odoo, órdenes filtradas por org) + tanda legado por env para
  las orgs sin fila. Credenciales rotas de una no afectan a las demás.
- 97 tests (3 nuevos de cifrado: round-trip, GCM detecta manipulación,
  error claro sin secreto).

**Pendiente Pablo**: (1) correr `supabase_integraciones.sql` en el SQL
Editor; (2) `CREDENCIALES_SECRET` y `CRON_SECRET` a Vercel (valores en las
últimas líneas de .env.local); (3) mergear PR #19; (4) darle a «Conectar
con Odoo» con sus credenciales reales (localmente no existen — nunca
estuvieron en .env.local).

---

## 2026-07-23 (3) — Odoo: sincronización automática de facturas (cron)

Pablo eligió llevar la integración de Odoo (que solo tenía botón manual de
buscar factura) a AUTOMÁTICA:

- **`/api/cron/odoo-facturas`** (GET, Bearer CRON_SECRET): para cada orden
  viva en fase de facturación (entregado→libramiento, máx 60, con OC) busca
  su factura en Odoo; si el estado cambió lo guarda y deja EVENTO en la
  bitácora de la orden («Odoo: la factura F-123 está PAGADA»); y avanza el
  estado cuando Odoo lo confirma: listo_facturar→facturado (factura
  publicada), facturado/libramiento→cobrado (paid). El avance usa
  `.eq("estado", anterior)` como guarda de carrera. Cliente admin (no hay
  sesión en un cron).
- **`buscarFacturasLote()`** en lib/odoo.ts: autentica UNA vez y busca en
  serie (gentil con el VPS); un fallo por OC no tumba el resto.
- **`vercel.json`** nuevo: cron diario 11:00 UTC (7 AM RD) — el plan Hobby
  limita a una vez al día; con Pro se puede subir la frecuencia.
- CRON_SECRET generado y agregado a `.env.local` (última línea); Vercel manda
  el header solo cuando la variable existe allá.

**Descubierto**: las ODOO_* NO están en .env.local (solo en Vercel, si
acaso) — localmente la integración está sin configurar; el cron hace no-op
limpio en ese caso. **Pendiente Pablo**: (1) confirmar que ODOO_URL/DB/
USERNAME/API_KEY están en Vercel (Production); (2) agregar CRON_SECRET en
Vercel con el MISMO valor de .env.local; (3) mergear PR #19; (4) probar
manual: `curl -H "Authorization: Bearer <secreto>"
https://adjudicado-app.vercel.app/api/cron/odoo-facturas`.

---

## 2026-07-23 (2) — Usabilidad móvil, segunda pasada: especialista UI/UX

Pablo probó en su iPhone y aparecieron más: descripciones de ítems cortadas,
«Generar este» montado sobre el texto de los requisitos. Además dos causas de
fondo previas: el dev server bloqueaba el JS desde otro origen
(`allowedDevOrigins` en next.config.ts) y el drawer quedaba fuera de pantalla
(el `backdrop-blur` de la top bar es containing block de `fixed` → portal al
body). Luego, barrido de especialista UI/UX (agente, 358px, toda la app):

- **Cotizador móvil = TARJETAS**: bajo `sm` cada línea es una tarjeta apilada
  (descripción a lo ancho, campos tocables, mismos handlers — `TarjetaLinea`);
  la tabla de 760px queda solo en desktop. Sin drag&drop en móvil (adrede).
- **Patrón transversal corregido**: filas `flex items-center` con botonera
  sin `flex-wrap` aplastaban el texto. Arreglado con wrap + `min-w`/`basis`
  en: FilaRequisito, **filas de ítems de orden/nueva (rompía crear orden)**,
  **DocsEmpresa (el nombre del doc quedaba en ~0px con 6 acciones)**,
  PlantillasLista, footer del modal EditarOrden, acciones del Editor de
  plantillas, cabeceras de bitácora, SuplidoresEditor.
- **Tablas admin en móvil**: BuscadorPrecios oculta Término/Suplidor y
  estrecha SKU; ListasManager oculta Vigencia/Importada/Productos (patrón
  `hidden md:table-cell`, como la bandeja).
- Menores: «Abrir orden» de documentos deja solo la flecha en móvil;
  MetricBar con truncate y text-lg; PlazosPanel a 1 columna; catálogo de
  entidades en flex (el logo se apilaba sobre el nombre); conectores de la
  LineaTiempo ocultos bajo sm (guiones sueltos al envolver); instrucción del
  editor de plantillas dice «toca» en móvil (el drag no existe al tacto).

**Lección**: el `backdrop-filter` de un ancestro captura los `fixed` (portal
o nada), y toda fila con botonera necesita `flex-wrap` + `min-w` en el texto.

---

## 2026-07-23 — Revisión móvil completa: menús y datos cortados

Pablo: «en móvil no funcionan bien los menús y se cortan los datos». Auditoría
con 2 agentes (navegación + layout 360-414px) y correcciones aplicadas — TODO
con clases base/max-sm o adiciones puras: desktop intacto.

**Lo grave que apareció (y se arregló):**
- **En móvil NO existía cerrar sesión ni cambiar de empresa**: el drawer nunca
  montaba `PieUsuario` ni el selector de org (solo estaban en el sidebar
  desktop). Ahora el drawer trae el selector «Tus empresas» en línea (nuevo
  `OpcionesOrg` compartido con desktop) y el pie de usuario con logout.
- **La lista de licitaciones cortaba Modalidad y Estado**: tabla con columnas
  fijas (400px+) dentro de `overflow-hidden` → clipaba sin scroll. Ahora
  `overflow-x-auto` + Modalidad oculta bajo md (patrón de la bandeja). Igual
  el buscador de precios (columna Precio clipada).
- **Los 8 tabs de Configuración se desbordaban** sin scroll → carrusel
  horizontal (`overflow-x-auto`, también en precios por defensa).

**Lo demás del drawer:** Escape cierra; scroll del body bloqueado mientras
está abierto; el acordeón «Estados» ahora responde (el onToggle era un no-op);
targets táctiles a ~44px (prop `tactil` en ItemNav/CuerpoNav — desktop
conserva su densidad); animación `slide-in-left` nueva (entraba desde el lado
contrario); `role="dialog"`; ancho 280px con `max-w-[85vw]`; hamburguesa y X
a 40px. Avisos (toasts) suben a z-60 (empataban con el drawer).

**Cortes menores:** alta de entidad (input w-64 fijo desbordaba → flex-wrap +
max-w-full); moneda/monto del alta de orden (grid-cols-3 → 2/sm:3); cierre
del proceso (datetime w-48 → w-full sm:w-48); filtros de bitácora con wrap;
botón primario de la Bid Room estirado en móvil (max-sm:flex-1); input del
buscador global a 16px en móvil (evita el auto-zoom de iOS).

**Sin tocar:** cotizador en móvil queda con scroll horizontal (usable; una
vista de tarjetas por línea sería v2), LineaTiempo hace wrap (funciona).

**Verificado:** tsc, eslint, 94/94 vitest. Pendiente Pablo: probar en su
teléfono (menú → cambiar empresa/cerrar sesión, lista de licitaciones,
Configuración, generar desde la Bid Room).

---

## 2026-07-22 (4) — Sistema de feedback: cada clic responde algo

Pablo: «le di clic a algo y está cargando, no sé qué» — y pasaba en cualquier
acción. Auditoría con agentes: de ~95 acciones del sistema, 34 sin señal de
espera, ~40 sin confirmación, 22 con fallo silencioso (órdenes fingía éxito),
6 spinners potencialmente infinitos, 0 loading.tsx, navegación sin feedback.
Se construyó el sistema completo (docs/sistema-ui.md §carga es la referencia):

- **Fundación** (`src/lib/`): `useAccion()` — el correr() canónico con clave
  POR ACCIÓN (se acabó el panel entero deshabilitado), anti doble-clic, error
  siempre visible (aviso por defecto, `errorInline` para forms). `avisos.ts` +
  `<Avisos/>` — toasts propios sin librerías (ok 2.5 s, error 7 s cerrable).
  `fetchLargo()` — tope de tiempo obligatorio en llamadas largas.
  En ui.tsx: `IndicadorGuardado` (canónico — antes 5 copias), `MicroGuardado`
  (check junto al campo editado), `Boton cargando`, `Esqueleto(Pagina)`.
- **Navegación**: `loading.tsx` general de (app) + siluetas de ficha para
  orden/[id], licitaciones/[id], entidades/[id] (fallback INSTANTÁNEO al
  clicar — era el ofensor nº1: pantalla congelada en cada navegación) +
  spinner con retardo 150 ms en el NavLink clicado (useLinkStatus).
- **Licitaciones/entidades**: cotizador con clave por línea y micro-check en
  el número (8 campos guardaban mudos); requisitos con «Subiendo…» en el
  clip y estado por fila; DatosProceso/FichaEntidad/EntidadesEditor/
  PerfilEmpresa/SubsanacionPanel migrados al patrón canónico.
- **Órdenes — optimista honesto** (agente): las ~20 actions devuelven ahora
  `string|null`; todos los controles optimistas hacen ROLLBACK + aviso si el
  servidor falla (antes la UI mentía); los adjuntos ya no quedan «subiendo…»
  eternos. El happy path no cambió (misma velocidad).
- **Esperas largas**: generar paquete/subsanación, vista previa de plantillas
  y OCR con `fetchLargo` + catch visible; el botón del OCR ganó su spinner.

**Decisiones**: sin librerías (toasts y skeletons propios, regla de la casa);
`unstable_instant`/Cache Components NO — exige otra arquitectura de datos;
`loading.tsx` es el camino correcto con páginas force-dynamic. Indicador con
retardo (150 ms nav / sin indicador <300 ms en autosave) para no parpadear.

**Verificado**: tsc, eslint (solo warnings preexistentes), 94/94 vitest.
**Pendiente Pablo**: probar en vivo (navegar, cotizador, requisitos, una
acción de orden sin red para ver el rollback+aviso) y mergear el PR #18.

---

## 2026-07-22 (3) — F.040: los campos «borrados» eran un bug de recorte de LibreOffice

Pablo reportó que el F.040 salía con los campos vacíos en PDF. Investigación
con A/B reales contra el Gotenberg del VPS (el docx SIEMPRE estuvo bien —
Word lo abre perfecto; era solo el PDF):

- **Causa raíz**: el `<w:sdt>` (content control del nombre de la entidad) que
  quedaba del original + una imagen inline en el tope del cuerpo disparan un
  bug de RECORTE en LibreOffice: pinta la imagen pero descarta el texto de la
  primera página (título y tabla del representante salían en blanco; los
  datos SÍ estaban en la capa de texto del PDF). **El original de la DGII,
  convertido tal cual, rompe igual** — no lo causó el taggeo.
- **Arreglo estructural en la plantilla**: el logo vive ahora en una tabla
  1×1 sin bordes (las imágenes dentro de celdas no disparan el bug — la firma
  lo probaba) y el sdt del nombre quedó desenvuelto (párrafo normal).
  Verificado E2E contra Gotenberg con el logo real (JPG) de la ONDP: página 1
  completa — logo, título, tabla del representante llena, firma.
- **De paso, higiene OPC**: el módulo free de imágenes guarda TODO como .png
  aunque el buffer sea JPEG. `corregirExtensionesDeMedia()` en generador.ts
  renombra la media a su formato real (magia de bytes: png/jpeg/gif/webp) y
  re-apunta relaciones y content-types tras cada render.
- Los demás formularios (F.033/034/042/047) no sufren el bug: su logo va
  dentro de un textbox. Verificados los PDF reales de hoy: perfectos (F.042
  ya sale con firma y sello; quedan en página 2 porque el formulario termina
  al borde — aceptable).
- 94 tests (2 nuevos: media renombrada + guardia de «sin content controls»).

**Lección**: «se ve bien en Word» no garantiza el PDF — validar SIEMPRE la
conversión LibreOffice con contenido real. Los sdt de Word son veneno para
LibreOffice cuando conviven con imágenes.

---

## 2026-07-22 (2) — Logos en TODOS los formularios, F.042 firmado, y «Generar este»

Pablo reportó 4 cosas de una vez. Diagnóstico y qué se hizo:

- **«Vercel está por detrás»** — falso ya: PR #15 y #16 se mergearon (el 16 hoy
  9:09 AM) y el deploy de main salió en verde. Lo único fuera era el fix de
  acentos del RNC (va en el PR de hoy). **«Falta la parte de PDF»**: el código
  está; `pdfDisponible()` exige GOTENBERG_URL **y** GOTENBERG_TOKEN en el
  runtime — si el botón dice solo «Generar paquete» (sin «PDF»), es que a la
  función no le llegan las DOS variables en el entorno Production. No se pudo
  verificar desde fuera (el middleware manda a /login antes del 501).
- **Logos en los formularios**: TODOS los SNCC oficiales traen el recuadro
  «Logo de la dependencia gubernamental», no solo el F.040. Cirugía XML sobre
  los 4 tpl restantes: F.033 (1 recuadro), F.034 (2 — una por página), F.042
  (2), F.047 (1) → `{%logo_institucion}` centrado en el lugar del sdt con la
  imagen en blanco. Sin logo cargado salen igual que siempre.
- **F.042 sin firma ni sello**: el formulario oficial TERMINA en el punto 6,
  no trae zona de firma. Se le añadió al pie el bloque centrado
  `{%firma} {%sello}` (mismo patrón del F.040).
- **Generar UN solo formulario**: `?solo=<código>` en /generar — baja directo
  el docx/pdf sin ZIP, sin gate (un formulario no es el paquete), y en
  segundo plano lo archiva y deja el requisito en «listo». En la Bid Room el
  chip «Se genera aquí» ahora es el botón **«Generar este»** (spinner mientras
  corre; PDF si el convertidor está configurado). El route ganó el helper
  `generarUno` (cascada completa) que usan el paquete y el suelto por igual.
- **Huella motor v5** (cambió cómo se imprimen los documentos).

**Verificado:** tsc, eslint, 92/92 vitest (3 nuevos), textutil OK sobre las 4
plantillas parchadas y sobre un F.042 rendido con firma+sello+logo.

**Pendiente Pablo:** revisar en Vercel → Settings → Environment Variables que
GOTENBERG_URL y GOTENBERG_TOKEN existan AMBAS marcadas para Production (y
redeploy si hubo que tocarlas); mergear el PR nuevo; subir logos de entidades.

---

## 2026-07-22 — Entidades: RNC autollenado desde el padrón de la DGII

**Hecho:** al crear una entidad, el sistema consulta el padrón de la DGII
(API pública `rnc.megaplus.com.do`, sin llave) y completa el RNC solo:

- **`src/lib/rnc.ts`** (solo servidor): `consultarPorRnc` / `buscarPorNombre` con
  timeout de 6 s y best-effort (si el servicio se cae, la app sigue igual);
  helpers puros testeables `extraerRnc` (¿escribieron un RNC de 9 dígitos o una
  cédula de 11, con guiones/puntos?) y `elegirCoincidencia` (exacta normalizada
  por razón social o nombre comercial; un único candidato también vale; con
  varios ambiguos no elige — mejor sin RNC que con el RNC de otro).
- **`crearEntidadAction`**: acepta nombre **o RNC** en el mismo campo. Con RNC →
  trae la razón social oficial de la DGII y crea con ambos (si el RNC no existe,
  error claro). Con nombre → crea y busca el RNC; si lo encuentra lo guarda y
  queda **evento en la bitácora de la entidad** («RNC … tomado del padrón de la
  DGII»). El chequeo de duplicados corre sobre el nombre final (el oficial).
- **Ficha de entidad**: botón de lupa junto al campo RNC (solo si está vacío) →
  `buscarRncEntidadAction` busca por el nombre y lo completa; mensajes distintos
  para «hay varias» vs «no aparece».
- Placeholder de «Nueva entidad» ahora dice «Nombre o RNC de la entidad».

**Decisión no obvia:** la razón social se guarda tal cual DGII (MAYÚSCULAS) al
crear por RNC — regla de fidelidad con el dato oficial; se puede editar después.

**Verificado:** tsc, eslint, 89/89 vitest (7 nuevos en `rnc.test.ts`), API real
probada (Banco Central 401-00755-1, Ministerio de Turismo 401-03681-9).

**Fix del mismo día (Pablo lo cazó en vivo):** la búsqueda por nombre fallaba si
el nombre llevaba acentos — la DGII guarda sin acentos y su búsqueda es literal
(«Educación» → 404, «educacion» → encuentra). Ahora `buscarPorNombre` pliega el
nombre con `normalizarEntidad` antes de consultar.

**Pendiente:** probar en la app con entidades reales; si algún día el servicio
megaplus muere, cambiar BASE en `src/lib/rnc.ts` por otro espejo del padrón.

---

## 2026-07-21 — F.040 Debida Diligencia: nuevo formulario del sistema con LOGO de la entidad

**Hecho:** Pablo trajo el SNCP-PROV-F-040 (debida diligencia y conflicto de interés)
y pidió agregarlo «oficialmente» — con el detalle de que arriba lleva el logo de cada
institución contratante. Se armó completo:

- **Plantilla taggeada** `plantillas/dgcp/SNCC_F040_Debida_Diligencia-tpl.docx`
  construida por cirugía XML sobre el original (que queda de referencia): el content
  control «Logo de la institución contratante» → tag `{%logo_institucion}`; el
  «[Insertar nombre...]» del título y la «(INSTITUCIÓN CONTRATANTE)» de la cláusula
  → `{entidad_nombre}` (quitando el ROJO de placeholder que traía la DGCP); datos de
  empresa/representante en sus celdas; `{%firma} {%sello}` sobre la línea de firma.
- **Nuevo tag de imagen** en el motor: `logo_institucion` en `ImagenesFirma`, escala
  proporcional a caja de 85×85 px (la caja de ~2.2 cm del formato). El route lo baja
  de `institucion.logo_url` (el logo que ya se sube en la ficha de entidad). Sin logo
  cargado, el espacio queda en blanco — igual que firma/sello.
- **Autollenado del historial**: la tabla «procedimientos adjudicados previamente» se
  llena sola con los procesos en estado `adjudicado` de la org (código, entidad,
  objeto, fecha) vía fila-bucle `{#adjudicados}`. Con historial vacío la fila
  desaparece limpia. El dato viaja como `extra` del route al generador (por eso
  `extra` pasó de `Record<string,string>` a `Record<string,unknown>`).
- `GENERABLES["SNCC.F.040"]` + entrada en el checklist estándar (legal, subsanable,
  **opcional** — no todos los pliegos lo piden). Por ser del sistema, ya admite
  variantes por entidad con la cascada de siempre.
- **Huella motor v4**: incluye la ruta del logo institucional y el historial
  adjudicado — cambiar el logo de la entidad o ganar un proceso regenera el paquete.
- Las 7 tablas declarativas restantes (directivos, accionistas, empleados, familiares,
  conflictos, empresas relacionadas) quedan en blanco a propósito: no capturamos esos
  datos aún. Candidatas a una futura sección en Configuración → Empresa.

**Decisión no obvia:** el código interno es `SNCC.F.040` (consistente con la familia
F.033/034/042) aunque el documento se autodenomina SNCP-PROV-F-040 (versión 2024).

3 tests nuevos (82 en total). Pendiente de Pablo: subir logos a las entidades y
probar generando un paquete con el F.040 en el checklist.

## 2026-07-21 — Cotizador: reordenar ARRASTRANDO (las flechas duraron una tarde)

**Hecho:** Pablo: «el sistema que quiero tiene que ser arrastrado». Las flechas ▲▼
se reemplazan por **drag & drop nativo** (HTML5, sin librerías): asa ⋮⋮ junto al
número (aparece al pasar el mouse), la fila viaja como imagen de arrastre, el
destino se resalta y al soltar el orden queda al instante (optimista) mientras
`reordenarItems` persiste orden_indice secuencial — un drop puede saltar varias
posiciones, por eso la mutación recibe la lista completa de ids. Las dos sub-filas
de cada línea aceptan el drop. Sigue: orden en pantalla = orden del F.033; el #
del pliego no cambia. moverItem (flechas) eliminado.

---

## 2026-07-21 — Cotizador: reordenar líneas y «Agregar línea» al pie

**Hecho:** quejas concretas de Pablo: no se puede mover una línea de posición, y
para agregar otra hay que subir al «+» de la cabecera. Dos arreglos estilo Odoo:

- **Flechas ▲▼ por fila** (aparecen al pasar el mouse, junto al #): `moverItem`
  reescribe `orden_indice` SECUENCIAL para todo el proceso (normaliza duplicados
  heredados) — el orden en pantalla ES el orden del F.033. El # del pliego no
  cambia (es identidad del pliego, no posición). Bordes deshabilitados.
- **«+ Agregar línea» al pie de la tabla**, donde termina el ojo — el botón de
  la cabecera se queda.

Ojo operativo: la laptop anda con ~17 GB libres y load ~5 — eslint/vitest
tardaron minutos (Turbopack compactó 66 s su caché). Sugerido liberar disco.

---

## 2026-07-20 — Lista de licitaciones como tabla inteligente

**Hecho:** Pablo: «eso debe tener una tabla dinámica con buscador y todas las
funciones inteligentes». ProcesosLista rehecha (patrón del catálogo de entidades):

- **Buscador tolerante** (`coincideTexto`) sobre código, objeto, ENTIDAD (nombre y
  siglas — el page ahora pasa el mapa institucion_id→entidad), modalidad y estado,
  con contador n/total.
- **Filtros por etapa con conteos**: Todas · En trabajo · Sometidas · Adjudicadas ·
  Perdidas y descartadas (los vacíos no se muestran).
- **Orden por columna** (Cierre/Proceso/Estado, asc/desc con flecha): el cierre
  ordena por el reloj VIVO — la subsanación abierta manda; sin fecha, al final.
- La entidad ahora se VE en cada fila (siglas · objeto). Estado vacío por filtro.
  Cabecera ordenable definida fuera del padre (la regla de la casa me la recordó
  el propio eslint).

---

## 2026-07-20 — Estados de licitación con distinción visual (mapa único)

**Hecho:** Pablo: «no hay distinción en cualquier estado de la licitación». La lista
pintaba los 10 estados con un mismo chip gris; LineaTiempo sí distinguía pero con
clases hardcodeadas. Nuevo `ESTADO_LIC_CHIP` en tipos.ts (única fuente, tonos -soft
de la casa): trabajo activo neutro con punto gris (captura/calificación/costeo/
armado) · **listo** primary · **sometido** primary con punto HUECO (en manos de la
entidad, esperando) · **subsanación** warn · **adjudicado** ok · **perdido** danger ·
**descartado** apagado. ProcesosLista usa chip+punto; LineaTiempo lee del mismo mapa.

---

## 2026-07-20 — La Bid Room resuelve plantillas con la MISMA cascada que el generador

**Hecho:** Pablo agregó COMPROMISO-ETICO al proceso de la SIE y «no se generaba».
Diagnóstico con la base: existen DOS plantillas con ese código — la variante de
MITUR (lista ✓) y la genérica (borrador, sin taggear). Para la SIE la cascada no
tiene nada usable → «¡FALTA!» en el índice. Pero la Bid Room mostraba «Se genera
aquí» porque miraba las plantillas listas de TODA la org sin cascada por entidad
(el gate del cliente y el del servidor divergían). Arreglo: `[id]/page.tsx` aplica
`resolverPlantillas(listas, institucion_id del proceso)` antes de pasar
plantillasOrg — la pantalla y el generador ahora dicen lo mismo. Para su caso:
publicar la genérica de COMPROMISO-ETICO (o quitar el requisito duplicado — el
COMP-ETICO del sistema ya se genera).

---

## 2026-07-20 — «1 PDF por sobre»: el paquete unido para subir 2-3 archivos, no 15

**Hecho:** Pablo: «¿hay forma de que me des los PDF unidos, una opción por sobre?».
Casilla **«1 PDF por sobre»** junto a Generar (marcada por defecto, solo con
Gotenberg configurado): el ZIP trae `Sobre_A.pdf` y `Sobre_B.pdf` con TODOS los
documentos unidos en el orden del índice (la subsanación, un solo
`Subsanacion_<código>.pdf`). Piezas:

- `unirPdfs()` en pdf.ts vía **Gotenberg `/forms/pdfengines/merge`** (el VPS ya
  estaba; cero dependencias nuevas). El orden se garantiza con nombres 001.pdf….
- Al unir, las **imágenes adjuntas también se convierten** a PDF (LibreOffice las
  pagina); si algo no se puede convertir/unir viaja suelto y el índice lo declara
  («suelto: …», «no se pudieron unir — van sueltos»). La unión fallida degrada a
  sueltos: nunca se pierde un documento.
- Huella con `unir` + zip `_pdf_unido.zip` (el listado de descargas lo etiqueta
  «PDF unido»). Los documentos sueltos de cada requisito se siguen subiendo igual.

---

## 2026-07-20 — Nombres de archivo ASCII puro en el paquete (los portales los rechazan)

**Hecho:** Pablo no podía subir los archivos generados: los nombres dentro del ZIP
llevaban espacios, acentos y el guion largo («Sobre A/01 SNCC.F.033 — Oferta
Económica.pdf»). `limpio()` ahora normaliza a ASCII puro — NFD sin diacríticos
(ñ→n), todo lo que no sea [A-Za-z0-9_-] pasa a "_", colapsado y recortado:
`Sobre_A/01_SNCC_F_033_Oferta_Economica.pdf`, `00_INDICE.txt`. Los documentos
sueltos ya salían limpios. Motor de render → v3 (invalida ZIP reusados con los
nombres viejos). Probado con casos reales (Declaración jurada, ñ, ¡!, &).

---

## 2026-07-20 — El F.033 imprime LO OFERTADO (marca + modelo — descripción)

**Hecho:** pregunta de Pablo: si pego la spec del pliego y abajo pongo mi Tablet
Samsung, ¿cuál sale en el formulario? Salía SOLO el campo descripción (sin marca ni
modelo), y con producto incompleto caía a la spec del pliego sin avisar. Dos cambios:

- `construirDatos`: la línea económica imprime **«Marca Modelo — Descripción»**
  cuando el producto está completo; la spec del pliego sigue de respaldo. 2 tests
  de regresión sobre el expediente realista del contrato.
- **Aviso en el cotizador**: chip «saldrá la spec del pliego» en la línea mientras
  falte marca, modelo o descripción — antes te enterabas viendo el PDF.
- **`motor: 2` en la huella**: subir la versión del motor de render invalida los
  ZIP reusados cuando cambia CÓMO se imprime (no solo qué datos) — antes un cambio
  así seguía sirviendo el paquete viejo hasta que el contenido cambiara.

---

## 2026-07-19 — Bid Room rediseñada: ficha con riel (auditoría UI/UX de 12 fallos)

**Hecho:** Pablo: «una sola columna, no aprovecha espacios, múltiples fallos». Un
agente auditor levantó 12 fallos (F1-F12) — el central: la Bid Room estaba declarada
como "ficha con riel" en docs/sistema-ui.md pero renderizaba UNA columna de 1200px,
con el estado del expediente (gate, total, paquetes) enterrado al fondo. Rediseño:

- **CabeceraPagina** (volver, código como título, entidad·modalidad·objeto·cierre)
  con las ACCIONES arriba: chip de días + Generar paquete PDF + Word. LineaTiempo
  en su propio panel debajo.
- **DisposicionFicha**: principal = Proceso → Requisitos → Ítems (→ Subsanación);
  **riel sticky** = tarjeta Subsanación en curso (solo abierta — su reloj y SU botón
  primario; el paquete completo baja a ghost mientras tanto), tarjeta Expediente
  (gate clicable, ítems sin cotizar, mini-tabla de totales, Validar, resultado,
  reusado, paquetes generados con descarga) y aviso de empresa/firmantes.
- **Eliminados**: la barra sticky de píldoras (chocaba con las de LineaTiempo que
  SÍ mutan estado — slip de Norman), el plegado por secciones con localStorage
  global (F11), el scroll-spy, y la doble cabecera de las 5 secciones (~150px).
- **Subsanación bajo demanda** (F6): la sección solo se monta con subsanación
  registrada o proceso sometido.
- **DatosProceso** con anchos por contenido (F8): objeto/entidad flexibles; cierre,
  modalidad, plazo, tasa y margen a su medida.
- Remates (F9-F10): vacío del cotizador con CTA «Primera línea», «Agregar N» del
  checklist también arriba, borde de botón al toggle subsanable, papelera separada.

---

## 2026-07-19 — El ZIP responde ya (archivo en 2.º plano) + descargas directas

**Hecho:** tras paralelizar, la generación seguía en ~100 s. El culpable real:
**el ZIP pesa 20 MB** y se subía a storage ANTES de responder — con el ancho de
subida de Pablo, ahí se iban los minutos (bandwidth, no latencia). Dos piezas:

- **`after()` de next/server**: el ZIP baja al navegador de inmediato; el
  respaldo (ZIP + documentos sueltos + fila de lic_paquete) se sube en segundo
  plano. La fila entra al FINAL: si el respaldo falla, la próxima generación no
  encuentra la huella y simplemente regenera (nunca reusa un ZIP fantasma).
- **«Paquetes generados — descarga directa»** en la sección Paquete: las últimas
  5 versiones (v, PDF/Word, fecha) con botón Descargar vía URL firmada — la
  respuesta a «¿tengo que volver a generar para descargar?»: NO. Y aunque le den
  a Generar de nuevo sin cambios, la huella devuelve el ZIP guardado al instante.

---

## 2026-07-19 — Generación 10× más rápida y el PDF como botón principal

**Hecho:** Pablo depuró su proceso CEIZTUR: «no la hizo en PDF sino en Word y duró
más de 3 minutos». Dos causas, dos arreglos:

- **Salió Word porque el botón primario generaba Word.** Ahora, con Gotenberg
  configurado (`pdfDisponible()` → prop `pdfListo`), el primario es **«Generar
  paquete PDF»** (lo que se presenta) y «Word» queda de secundario editable —
  igual en la subsanación.
- **112 s de app-code para 11 requisitos**: TODO el storage iba EN SERIE
  (3 imágenes + plantillas + ~10 adjuntos + subidas, a segundos por viaje).
  Paralelizado con Promise.all en 4 frentes: imágenes, descarga de plantillas
  de la org (paso 5, ahora con try/catch), prefetch de adjuntos + conversión
  PDF (mapa `adjuntoPorRequisito`; el ensamblado del ZIP queda puro CPU y
  conserva el orden), y subidas (ZIP + documentos + updates). Además esos 112 s
  habrían REVENTADO en Vercel (maxDuration=60) — esto también lo tapa.

---

## 2026-07-19 — Cotizador: modo de ITBIS por línea (estilo Odoo)

**Hecho:** Pablo: «el precio debe tener opciones: ITBIS incluido, más ITBIS, sin
ITBIS». Nueva columna `lic_item.itbis_modo` (migración en prod):

- **+ ITBIS** (default): el precio tecleado es la base; el impuesto se suma.
- **incluido**: el precio YA trae el ITBIS → la base se despeja (÷ 1.18) y se
  muestra bajo el subtotal («base X/u»); el total vuelve al precio tecleado.
- **exento**: sin ITBIS (licencias/intangibles, Decreto 293-11).

El checkbox del cotizador pasó a ser un select de 3 modos. **Clave de diseño**: el
contrato canónico exige `precio_unitario` = base SIN ITBIS, así que el modo se
resuelve en `construirCanonico` (despeja la base con `precioBaseUnitario`) y el
F.033, las letras y el generador NO cambian. `itbis_aplica` queda como columna
derivada (modo ≠ exento), sincronizada en cada patch, para que los payloads
históricos de lic_paquete sigan válidos. 77 tests (4 nuevos de modos).

---

## 2026-07-19 — Selector de entidad con búsqueda tolerante en Nuevo proceso

**Hecho:** Pablo buscaba el «Comité Ejecutor de Infraestructura de Zonas Turísticas» al
crear un proceso y no aparecía. Diagnóstico: la entidad NO existe en su catálogo (23
entidades, cero coincidencias en la base) — el catálogo se construye con lo que la org
registra, no viene precargado con las instituciones del Estado. Pero el `<select>` plano
no dejaba ni buscar ni entender eso. Nuevo `src/components/SelectorEntidad.tsx`
(combobox con `coincideTexto`: filtra al escribir, tolera mayúsculas/acentos/faltas) y
si no hay coincidencia lo dice claro: «No está en tu catálogo — se creará “X” al
guardar» (mismo flujo institucion_nueva de siempre). Adoptado en Nuevo proceso; el
selector de DatosProceso (Bid Room) queda como candidato a adoptarlo después.

---

## 2026-07-19 — «Reemplazar Word»: subir el archivo de la entidad sobre una plantilla

**Hecho:** Pablo creó la variante MITUR pero solo podía *modificar* la copia — no
subirle el Word que la entidad envió. Nueva acción **Reemplazar Word** en dos sitios:
el botón «Word» en cada fila de la lista de plantillas y «Reemplazar Word» en el
editor. Sube el .docx nuevo, limpia las asignaciones (los huecos del documento nuevo
son otros), la plantilla vuelve a borrador y te deja en el editor para arrastrar las
variables. Borra los archivos viejos de storage y lo registra en la bitácora de la
entidad si es variante. Con confirm() antes — se pierde el taggeo anterior a propósito.

---

## 2026-07-19 — SUBSANACIÓN: registrar → marcar → generar el paquete chico

**Hecho:** el flujo completo de subsanación (la entidad pide por correo documentos
faltantes/corregidos tras presentar, con fecha límite corta). Piezas:

- **`lic_subsanacion`** (proceso, fecha_limite, texto del correo, estado
  abierta→enviada→cerrada) + **`lic_requisito.subsanacion_id`** (qué pidieron) +
  tipo `subsanacion` en la bitácora de la entidad. Migración en prod (201).
  Una sola subsanación viva por proceso.
- **Bid Room**: sección nueva «Subsanación» — registrar (datetime-local + correo
  pegado tal cual), lista de lo pedido con su semáforo, generar (docx/PDF),
  «Marcar enviada» (fecha registrada) y «Cerrar». El chip del reloj
  («subsana 2d») vive en la barra sticky con la urgencia de siempre. En
  2 · Requisitos cada fila gana el botón **«Subsanar»** (marcar lo devuelve a
  pendiente; los errores de generación caen en la sección de subsanación).
- **`/generar?subsanacion=id`**: paquete CHICO solo con lo pedido, SIN sobres,
  índice «SUBSANACIÓN — vence …», zip `subsanacion_*.zip`, huella propia
  (misma idempotencia). Gate distinto: en una subsanación TODO lo pedido es
  obligatorio (no existe "subsanable después" — esto ES el después). Puede ser
  puros adjuntos re-subidos (sin generables) y sale igual.
- **Lista de licitaciones**: si hay subsanación abierta, su reloj MANDA sobre el
  del cierre (chip + etiqueta «subsana»).

**Decisión no obvia:** lo pedido se modela marcando los requisitos existentes
(subsanacion_id), no con una tabla de items aparte — reusa checklist, subida,
plantillas (incl. variantes MITUR) y generación sin duplicar nada.

---

## 2026-07-19 — Variantes también de los formularios del SISTEMA (caso MITUR)

**Hecho:** Pablo tiene formularios que MITUR envió para una subsanación, pero en
Plantillas solo salían los códigos propios de la org — no los 7 del sistema. Dos arreglos:

- **Configuración → Plantillas ahora tiene el bloque «Formularios del sistema»** (desde
  GENERABLES): cada uno con su botón «Variante» — eliges la entidad y subes el Word TAL
  CUAL lo envió esa entidad (nace como borrador con el código del sistema, p. ej.
  SNCC.F.033 + institucion_id, y se taggea en el constructor). Sus variantes cuelgan
  debajo; los códigos del sistema ya no se mezclan con el bloque de la organización.
- **La cascada ahora es completa en la generación**: antes `GENERABLES[codigo]` ganaba
  SIEMPRE — una variante del F.033 jamás habría salido. Ahora la plantilla resuelta
  (variante de la entidad → genérica de la org) gana sobre el formulario del sistema,
  que queda como último recurso. La huella ya lo cubría (incluye la plantilla usada).

**Pendiente de diseño:** flujo de SUBSANACIÓN (la entidad pide por correo documentos
faltantes/corregidos tras presentar). Análisis entregado a Pablo: nueva `lic_subsanacion`
con fecha límite + selección de requisitos afectados + mini-paquete solo con eso.
Sin código todavía — esperando su OK.

---

## 2026-07-18 — Variantes de plantilla por entidad (cascada entidad → org → sistema)

**Hecho:** Pablo: «a veces las entidades tienen su propia versión con pequeños cambios
de los formularios». Solución tipo ERP: una plantilla puede ser **genérica** de la org
o **variante de una entidad** (`lic_plantilla.institucion_id`, unicidad partida en dos
índices parciales — migración aplicada a prod, 201). Piezas:

- **Cascada al generar** (`resolverPlantillas`, pura, 5 tests): para cada código gana
  la variante de la entidad del proceso; si no hay, la genérica; si no, el sistema.
  El usuario no configura nada por proceso.
- **«Variante para una entidad…»** en Configuración → Plantillas: duplica la plantilla
  YA construida (archivos en storage + asignaciones + variables) asignada a la entidad
  — solo se edita lo que esa entidad cambió. Las variantes cuelgan agrupadas bajo su
  genérica con la etiqueta de la entidad; el editor muestra el badge «Variante · X».
- **Ficha de la entidad**: riel «Formularios propios (n)» + eventos tipo `plantilla`
  en su bitácora (crear/eliminar variante quedan escritos).
- **La huella del paquete ahora incluye qué plantilla exacta respondió cada código**
  (id + updated_at). Esto además tapa un hueco previo: editar/republicar una plantilla
  no invalidaba el ZIP reusado. Efecto: una regeneración única tras el deploy.

**Decisión no obvia:** la variante comparte el `codigo` del requisito — el checklist no
cambia; solo cambia *cuál archivo* responde. Si solo existe la variante (sin genérica),
responde únicamente a su entidad. 73 tests.

**Pendiente:** PR a main sigue abierto (con las env de Gotenberg en Vercel antes).

---

## 2026-07-17 — Búsqueda tolerante en toda la app (regla permanente)

**Hecho:** Pablo buscó «instituto» y no encontró «Instituto…» (en uno de los buscadores
viejos, sin normalizar). Su regla, ahora permanente: *el usuario no sabe cómo está creado
el nombre* — mayúsculas, acentos y faltas ortográficas no pueden romper una búsqueda.
Nuevo `src/lib/buscar-texto.ts` (`coincideTexto`): pliega mayúsculas/acentos, tolera 1-2
letras de error según el largo (Levenshtein con banda) y acepta prefijos a medio teclear.
Aplicado a los 5 buscadores en memoria (entidades, bandeja, actividad, documentos,
bitácora de orden); el Cmd+K global ya usaba unaccent en SQL. «insituto» → Instituto ✓.
68 tests. También: buscador nuevo en /entidades (tabla filtrable con contador).

---

## 2026-07-17 — Cartas timbradas: el logo de la empresa encabeza las cartas

**Hecho:** Pablo pidió que la empresa suba su logo para cartas timbradas. Piezas:

- Tipo **"logo"** en Configuración → Empresa (catálogo TIPOS_DOC_EMPRESA; PNG/JPG, no
  vence) — se sube igual que firma y sello.
- **Membrete** en las 3 cartas propias (CARTA-COND, DJ-ART38, DJ-COLUSION), regeneradas
  con `scripts/generar-cartas-base.py`: logo centrado + «{empresa} · RNC …» + línea de
  contacto en gris pequeño + filete. Sin logo cargado, la carta sale igual (el tag no
  pinta nada) y el timbrado textual queda.
- Motor: `ImagenesFirma.logo`; el logo se escala **proporcional a su tamaño real**
  (parser de dimensiones PNG/JPEG propio — la caja fija deformaba) con tope 190×60 px.
- `/generar` carga firma+sello+logo; la huella de idempotencia ya lo cubre (cambiar el
  logo regenera). Vista previa del constructor lo simula, y **el constructor gana la
  variable "Logo de la empresa"** arrastrable a cualquier plantilla propia.
- Tests: 63 en verde (membrete proporcional 300×120→150×60, carta sin logo intacta) +
  validación externa con textutil.

**Pendiente de verificación de Pablo:** subir el logo real en Configuración → Empresa →
regenerar el paquete → las cartas salen timbradas.

---

## 2026-07-17 — Sistema de página desktop-first (estilo ERP/Odoo)

**Hecho:** Pablo: «parece una app móvil alargada viéndose en desktop» — la acción
evidente al fondo (Generar PDF en la licitación), campos estirados a todo el ancho, sin
sistema. Plan aprobado en plan mode (2 agentes: auditoría + patrones Odoo/ERP) y
ejecutado completo (commits fases 1-3 y 4-5):

- **Primitivas** en ui.tsx: `CabeceraPagina` (título+volver+acciones — la acción
  principal SIEMPRE arriba), `Hoja` (anchos por tipo: form 2xl / feed 3xl / lista 4xl /
  ficha 1200px; las tablas densas siguen full-width) y `DisposicionFicha` (riel sticky
  360px con orden móvil correcto).
- **BidRoom**: Generar paquete/PDF + chip del gate + progreso viven en la barra sticky;
  la sección Paquete queda para Validar y el detalle de errores (y al fallar, salta ahí).
- **FichaEntidad**: sheet capado, bitácora al riel derecho (chatter con scroll interno),
  contactos con anchos según contenido (email 11rem, tel 7rem, ext 3.5rem).
- **Adopción total**: cabecera única en actividad/documentos/licitaciones/entidades/
  orden-nueva/precios/configuración; licitaciones/layout.tsx ELIMINADO (metía un h1
  ajeno encima de la Bid Room).
- **docs/sistema-ui.md**: las reglas para que todo lo futuro siga el sistema.

**Deuda visible:** eslint global marca `set-state-in-effect` preexistente en
BuscadorGlobal y TriageTable (patrón localStorage-tras-montar; mismo caso documentado).

---

## 2026-07-17 — Navegación al nivel de las mejores tools (sin tocar la línea gráfica)

**Hecho:** Pablo pidió mejores menús y jerarquía de información, investigado con dos
agentes (auditoría de la app + patrones de Linear/Notion/Attio). Cambios, mismos tokens
y colores:

- **Sidebar colapsable a rail de iconos** (60px, tooltips, preferencia recordada) — el
  beneficio real es espacio horizontal para las tablas anchas. Extraído a
  `_components/Sidebar.tsx` (client); el layout solo prepara datos serializables.
- **Sección "Estados" plegable** con chevron y contador agregado al plegarse; recordada.
- **Configuración y Equipo a la vista** al pie del sidebar (antes enterrados dentro del
  menú desplegable del usuario).
- **Menú móvil (drawer)**: antes en móvil la navegación NO existía (solo logo + buscar +
  nueva). Ahora hamburguesa → drawer con el nav completo + estados + configuración.
- **Jerarquía Bandeja**: la tabla de órdenes vivas sube; "Actividad reciente" pasa
  después de la mesa de trabajo (era contexto empujando la tarea hacia abajo).
- **Orden [id] en móvil**: el riel (Detalles/Plazos/Documentos/contactos) se intercala
  después del estado y ANTES de ítems/bitácora (antes caía al fondo). En desktop igual
  que siempre (grid explícito col-start/row-start + order).

**Regla aprendida:** grupos de sidebar <3 ítems no se agrupan; el rail exige tooltips e
iconos distinguibles; los KPIs que no filtran son decoración.

---

## 2026-07-17 — Gestión de entidades: ficha completa con bitácora

**Hecho:** herramienta nueva `/entidades` (pedido de Pablo). Se apoya en lo que YA
existía — `institucion` es el catálogo único que enlazan órdenes y licitaciones,
`contacto` ya era polimórfico (suplidor O institución), `grupo` ya existía — y agrega lo
que faltaba:

- **Migración** `supabase_entidades.sql` (aplicada a producción, 201): `institucion` gana
  telefono/logo_url/notas; `contacto` gana extension/notas; tablas nuevas
  `institucion_asignacion` (persona O grupo, check exactly-one, RLS es_miembro) e
  `institucion_evento` (la bitácora: perfil|logo|contacto|asignacion|nota).
- **Lista** `/entidades`: tarjetas con logo, RNC, conteo de órdenes/procesos y asignados.
- **Ficha** `/entidades/[id]`: perfil con autosave + logo subible (storage
  `{org}/entidades/{id}/`, URL firmada 1h para el `<img>`); contactos con cargo, email,
  tel. directo y extensión (autosave por campo, mailto:); asignación por chips toggle a
  personas y grupos; "De esta entidad" (licitaciones y órdenes enlazadas); **bitácora**
  con TODOS los movimientos: cada acción de la ficha se registra sola + se mezclan las
  entradas de bitácora de las órdenes de esa entidad (badge "orden" con link) + notas
  manuales.
- Menú lateral gana "Entidades"; el catálogo de Configuración → Entidades enlaza "Ficha".

**Pendiente de verificación de Pablo:** entrar a /entidades, subir un logo, asignarse
una entidad, crear un contacto con extensión y ver la bitácora moverse.

---

## 2026-07-17 — Sello cazado, espera amigable y paquetes que no se regeneran en vano

**El sello del F.033 (y las cartas sin timbrar) — CAZADO.** No era la imagen ni la
plantilla: docxtemplater-image-module-free solo renderiza UN tag de imagen por run.
Todas las plantillas tienen `{%firma} {%sello}` en el mismo run → la firma salía y el
sello se consumía sin pintar nada. Arreglo en el motor (`separarTagsDeImagen` en
generador.ts): antes de rellenar, cada tag de imagen se aísla en su propio run
conservando el formato — cubre las plantillas del sistema Y las del constructor, en
document.xml, headers y footers. Tests contra el F.033 real y las 3 cartas (firma+sello
= 2 dibujos nuevos cada una).

**Espera amigable al generar:** la generación tarda (Gotenberg, adjuntos); ahora el
botón muestra pasos en vivo («Rellenando los formularios…», «Convirtiendo a PDF…»,
«Armando los sobres…») con spinner y el aviso de que el ZIP baja solo. Los pasos avanzan
con reloj — el orden es el real aunque el servidor no reporte progreso.

**Idempotencia de verdad:** `/generar` calcula una huella sha256 de TODO lo que cambia
el resultado (expediente sin meta — la versión sube sola —, adjuntos, datos capturados,
firma/sello, formato) y si ya existe un lic_paquete con esa huella devuelve su ZIP de
storage al instante (header `X-Paquete-Reusado`). La Bid Room lo dice en verde y ofrece
«Generar de nuevo de todos modos» (`?regenerar=1`) — útil p. ej. para refrescar la fecha
de las cartas, que no entra en la huella a propósito.

**Pendiente de verificación de Pablo:** regenerar su paquete real → el F.033 y las 3
cartas deben salir con firma Y sello; segunda descarga sin cambios = instantánea.

---

## 2026-07-17 — El paquete es ahora el EXPEDIENTE COMPLETO por sobres

**Hecho:** Pablo reportó que el ZIP «solo está generando al azar» — llevaba únicamente
los formularios que el motor genera; lo subido a mano y lo de Empresa quedaban fuera.
Ahora `/generar` arma el expediente presentable:

- **Todos los requisitos marcados** salen con su archivo: los `genera` se rellenan como
  siempre; los `sube` anexan lo subido al requisito; los `empresa` anexan el documento
  enlazado de Configuración → Empresa.
- **Ordenado por sobre**: carpetas `Sobre A` (legal/financiera/técnica/otros) y
  `Sobre B` (económica), archivos numerados `NN CODIGO — Nombre.ext`.
- **`00 INDICE.txt`**: qué contiene cada sobre y de dónde salió cada archivo; lo
  verificado en línea (DGII/TSS/RPE) se declara sin archivo, y lo pendiente sale como
  «¡FALTA!» + lista final — nada desaparece en silencio.
- En el paquete PDF los adjuntos Word también se convierten vía Gotenberg; PDFs e
  imágenes viajan tal cual.

**Pendiente de verificación de Pablo:** generar el paquete de su proceso real y revisar
que el ZIP traiga los sobres con lo subido + lo de Empresa + lo generado y el índice.

---

## 2026-07-16 — Bid Room: una sola página con secciones plegables

**Hecho:** Pablo reportó que la Bid Room era confusa — las 4 estaciones eran pestañas
excluyentes y para comparar cualquier dato había que ir y volver. Rediseño (commits
`7a37246` + `dc71856`):

- **Una sola página**: Proceso → Requisitos → Ítems → Paquete apiladas en orden de
  trabajo; se cotiza mirando el pliego sin cambiar de vista.
- **Barra sticky** con el estado vivo de cada sección (críticos en rojo, "N sin cotizar",
  total de la oferta, gate bloqueado/listo); clic = saltar; scroll-spy resalta la actual.
- **Secciones plegables** (pedido explícito): chevron por sección, el estado sigue
  visible aunque esté cerrada, lo plegado se recuerda en localStorage, y saltar desde la
  barra o avanzar la línea de tiempo expande la sección destino antes de desplazarse.

**Decisión no obvia:** la regla nueva `react-hooks/set-state-in-effect` prohíbe el
patrón de "leer localStorage tras montar" (que TriageTable ya usa); se desactivó en esa
línea con justificación — el doble render inicial es deliberado para no romper la
hidratación.

---

## 2026-07-16 — Variables personalizadas: "dominicano" y los datos que se preguntan

**Hecho:** las plantillas del constructor ahora aceptan variables PROPIAS, en dos sabores
(pedido de Pablo: «hay variable por ejemplo dominicano, y personalizados»):

- **Valor fijo** — se define una vez en la plantilla ("Nacionalidad" = "dominicano") y
  sale igual en todos los procesos.
- **Se pregunta al generar** — se define sin valor; cada proceso captura el suyo en el
  requisito (2 · Requisitos muestra un mini-form con autosave; el campo vacío marca
  "— falta" en ámbar). Los valores viven en `lic_requisito.datos` (jsonb).

Piezas: migración aplicada a producción (`lic_plantilla.variables_personalizadas` jsonb +
`lic_requisito.datos` jsonb); el editor gana la sección "De esta plantilla" (crear con
etiqueta + valor fijo opcional, chips arrastrables con badge fija/se pregunta, quitar
limpia sus asignaciones); `aplicarAsignaciones` acepta `clavesExtra`; la vista previa
rellena con el valor fijo o `[Etiqueta]`; `/generar` mezcla `construirDatos` + fijos +
capturados y devuelve **422 con la lista** si falta un dato que se pregunta (el Bid Room
ya la pintaba). Test nuevo de ida y vuelta con clave personalizada (56 en verde).

**Decisión no obvia:** la clave se deriva de la etiqueta (slug) y se prefija `x_` si
choca con una variable del sistema — el usuario nunca teclea claves.

**Pendiente de verificación de Pablo:** crear en el editor una variable fija
("Nacionalidad" = dominicano) y una que se pregunta, arrastrarlas, publicar, y en un
proceso completar el dato en el requisito → generar el paquete.

---

## 2026-07-16 — Constructor Fase 2: las plantillas propias entran al paquete

**Hecho:** el círculo cerrado. Los requisitos cuyo código coincide con una plantilla
"lista" del constructor se generan en el paquete junto a los 7 del sistema:

- La ruta `/generar` resuelve cada requisito contra GENERABLES ∪ `lic_plantilla` (lista):
  las del sistema salen del repo, las de la org se descargan de storage y se rellenan con
  el mismo `construirDatos` + firma/sello.
- El **gate** reconoce las plantillas propias: un requisito crítico cuyo documento genera
  el propio botón no bloquea.
- El **picker del checklist** gana el grupo "Tus plantillas" (con chip "Se genera"), y
  `crearRequisitosLote` crea el requisito desde la plantilla (subsanable por defecto,
  firma GG, origen generado). Las filas muestran la vía "Se genera aquí".

**Pendiente de verificación de Pablo:** subir una plantilla real en el constructor,
taggearla, publicarla, agregarla a un proceso por el checklist y generar el paquete — su
documento debe salir en el ZIP con los datos del expediente.

---

## 2026-07-16 — Constructor de plantillas, Fase 1: taggear sin código

**Contexto:** Pablo pidió que el usuario suba un Word, arrastre variables y la plantilla
quede reutilizable — sin código. Es la interfaz de lo que hice a mano con las plantillas
DGCP.

**Hecho:**

- Tabla `lic_plantilla` (org, código→requisito, original + tpl en storage, asignaciones
  jsonb, borrador/lista) — migración aplicada en producción.
- `variables.ts`: el catálogo de 24 variables (proceso/empresa/firmante/económico/
  imágenes) — fuente única para fichas, ejemplos y validación.
- `plantillas.ts`: **el motor** — `analizarDocx` (párrafos con conteo de profundidad —
  los cuadros de texto anidan w:p — y detección de huecos: subrayados, [instrucciones],
  líneas de puntos, controles, tags ya escritos) y `aplicarAsignaciones` (el port a TS del
  reemplazo quirúrgico sobre runs de taggear-plantillas.py, por posición exacta, con
  limpieza de formato y los seguros de LibreOffice: xmlns de dibujo, content-types,
  rels). **8 tests dedicados**, incluyendo tramos que cruzan runs y la ida-y-vuelta con
  docxtemplater.
- UI en Configuración → Plantillas: lista + editor de dos paneles — documento con huecos
  resaltados como zonas de soltar (drag & drop nativo, o clic-hueco + clic-ficha),
  fichas por grupo con ejemplo, autosave, vista previa en PDF real (Gotenberg) con datos
  de ejemplo y firma/sello de muestra, y "Guardar y publicar" (aplica, sube el tpl,
  estado lista).

**Pendiente (Fase 2):** enchufar a la generación — que los requisitos cuyo código coincida
con una plantilla "lista" de la org se generen en el paquete junto a los 7 del sistema.

---

## 2026-07-16 — Fase 4c: los 7 documentos "se genera aquí", generándose

**Contexto:** Pablo probó "Generar paquete" (funcionó — 3 Word) y pidió el resto de los
requisitos marcados como generables, más el plan de firma y sello.

**Hecho:**

- **Compromiso Ético oficial** descargado de la DGCP y taggeado (17 espacios en orden fijo
  → reemplazo secuencial; el subrayado de la firma se queda).
- **Cartas propias construidas desde cero** (`scripts/generar-cartas-base.py` →
  `plantillas/cartas/`): Declaración jurada art. 38 Ley 47-25, Aceptación de condiciones,
  Declaración de no colusión. Son documentos nuestros: sin regla de fidelidad, formato de
  carta formal.
- Generador ampliado a 7 GENERABLES (con carpeta dgcp/cartas), datos nuevos (cédula del
  firmante, día/mes/año en letras, ciudad/provincia), gate y tracing de Vercel al día.
- Smoke: las 8 plantillas rellenan y pasan textutil. 45 tests.

**Plan de firma y sello (siguiente corte):** (1) subir imagen de firma y sello en
Configuración → Empresa (tipos nuevos en documento_empresa; lic_firmante ya tiene las FKs);
(2) incrustar las imágenes EN EL DOCX al generar (módulo libre de imágenes de
docxtemplater, JS puro, corre en Vercel) sobre tags {%firma}/{%sello} en los bloques de
firma — la posición la resuelve Word, no coordenadas de PDF; (3) PDF vía Gotenberg
(contenedor, ~US$5/mes); interim: exportar a PDF desde Word. La "firma en todas las
páginas + foliado" que piden algunos pliegos = post-proceso del PDF con pdf-lib.

---

## 2026-07-16 — Fase 4b: "Generar paquete" vivo — del expediente al ZIP

**Hecho:** el ciclo completo. `src/lib/licitaciones/letras.ts` (monto en letras es-DO,
implementación propia — ruta crítica legal, con 22 tests incluyendo apócopes VEINTIÚN/UN y
el redondeo del monto completo) · `generador.ts` (canónico → datos → docxtemplater →
.docx; el mapper formatea, la plantilla no calcula) · `GET /api/licitaciones/{id}/generar`:
valida el expediente (422 con faltantes), aplica **EL GATE como bloqueo duro** (409 si hay
NO subsanables pendientes — sin contar F.033/034/042, que son lo que la generación
produce), rellena, sube cada .docx y el ZIP a storage, marca los requisitos generados como
listos con su archivo, registra `lic_paquete` (payload + hash: idempotencia) y baja el ZIP.
Botón "Generar paquete" vivo en la Bid Room (deshabilitado si el gate bloquea; errores
legibles en pantalla). `outputFileTracingIncludes` para que Vercel empaquete las plantillas
(el ENOENT clásico no aparece en dev).

**Pendiente:** prueba end-to-end de Pablo con su expediente real (clic en Generar → abrir
el ZIP). PDF + firma estampada = siguiente corte (Gotenberg + pdf-lib). Cartas propias
(DJ art. 38, aceptación de condiciones) y Compromiso Ético: próxima tanda de plantillas.

---

## 2026-07-16 — Fase 4a: las plantillas DGCP rellenan de verdad (3 bugs de Word cazados)

**Hecho:** plantillas oficiales F.033/034/042/047 descargadas del portal DGCP, taggeadas
con `scripts/taggear-plantillas.py` (reproducible) y verificadas rellenando con
docxtemplater (`scripts/probar-relleno.mjs`). Previews con datos de ejemplo en
~/Downloads/adjudicado-formularios-preview para el ojo de Pablo.

**Tres bugs de "Word no lo abre" — las lecciones importan más que los parches:**

1. **xmlns descartados:** ElementTree solo declara los namespaces USADOS, pero
   `mc:Ignorable` referencia prefijos por nombre (w14, wp14…) → si su declaración
   desaparece, Word marca contenido ilegible. Fix: `restaurar_xmlns()` fusiona en la raíz
   lo que falte.
2. **sdt de bloque → run:** el control "No. EXPEDIENTE" de los encabezados contiene
   párrafos; sustituirlo por un run pelado deja XML bien formado que Word NO abre (error
   duro, en las 4). Fix: detectar el nivel y emitir párrafo con su pPr.
3. **El dato heredaba el ROJO** de las instrucciones originales (y en los membretes
   quedaban los textos guía "Nombre del Capítulo…"). Fix: pasada `limpiar_formato_de_tags`
   (color/cursiva fuera de los runs con marcador) + `TEXTO_GLOBAL` aplicado a headers.

**Lección de proceso:** "XML bien formado" ≠ "Word lo abre". El chequeo estructural
(runs en nivel de bloque, Ignorable ⊆ declarados, placeholders residuales) quedó en el
script, y la validación con un lector independiente (textutil) antes de pedirle a Pablo
que pruebe.

**Sigue (Fase 4b):** cablear "Generar paquete" (expediente → mapper → docx rellenos → ZIP).
Pendiente señalado por Pablo: plantillas para Compromiso Ético (anexo del pliego), DJ
art. 38 y carta de aceptación (cartas propias, se generan desde cero); la Debida
Diligencia es formulario propio de cada entidad (vía "sube").

---

## 2026-07-16 — La Bid Room como línea de tiempo (feedback de Pablo)

**Contexto:** "la primera pantalla debe pedir datos del proceso, todo tiene que ser una
línea de tiempo de licitaciones."

**Hecho:**

- **`LineaTiempo`**: el recorrido del proceso arriba de la Bid Room — captura →
  calificación → costeo → armado → listo → sometido, con subsanación como desvío y los
  terminales (adjudicado/perdido/descartado) como remate. Cada punto es clicable, "Avanzar
  a X" es la acción principal, y tras someter aparecen los botones de resultado.
- **Cuatro estaciones**: 1 · Proceso (datos completos con autosave — objeto, entidad,
  cierre, modalidad, adjudicación, criterio, plazo de pago, overrides de tasa/margen,
  notas), 2 · Pliego, 3 · Cotización, 4 · Paquete (el gate + validar expediente + botón
  "Generar paquete" deshabilitado como adelanto de la Fase 4/5).
- Al cambiar el estado en la línea, la pantalla te lleva a la estación que corresponde
  (captura → Proceso, calificación → Pliego, costeo → Cotización, armado+ → Paquete).

---

## 2026-07-15 — La Bid Room en dos pasos: primero el panorama, después la plata

**Contexto:** feedback de dominio de Pablo: "están mezclando ítems, cotización, catálogo y
prerequisitos — primero elegimos o sabemos qué piden, y con ese panorama hacemos la parte
económica". La máquina de estados ya lo sabía (captura → calificación → costeo) pero la
pantalla lo mezclaba todo en una tarjeta.

**Hecho:** la Bid Room ahora tiene dos pasos con pestañas: **1 · Pliego — qué piden**
(ítems con su spec tal cual + el checklist de requisitos; ni un precio a la vista) y
**2 · Cotización — nuestra oferta** (solo los ítems marcados "ofertamos": producto
ofrecido + precio del catálogo o manual + totales). El paso inicial sale del estado del
proceso (captura/calificación → Pliego; costeo en adelante → Cotización). El ItemsPanel
viejo que mezclaba todo se eliminó; la pestaña de cotización muestra "N sin cotizar".

---

## 2026-07-15 — Requisitos como checklist estándar SNCC (feedback + pliego real)

**Contexto:** Pablo pasó un pliego real (SNCC.P.004, CNSS-CCC-CP-2026-0001) y pidió que los
requisitos fueran un checklist en vez de teclearlos uno a uno. El pliego confirmó la
estructura estándar: Sobre A (legal [subsanable] / financiera [subsanable] / técnica [NO
subsanable]) y Sobre B (económica), y que DGII/TSS/RPE "no se depositan, se verifican en
línea".

**Hecho:**

- `requisitos-estandar.ts`: catálogo de 23 requisitos calcado del pliego real, agrupados
  por sobre, con su subsanable de fábrica, flag "en línea" y **enlace a documento_empresa**
  (DGII→dgii, RPE→rpe, Registro Mercantil→mercantil, cédula, estados financieros…).
- **Picker de checklist** en la Bid Room: los estándar agrupados, pre-marcados salvo los
  "si aplica"; un clic agrega todos. Lo que la empresa ya tiene VIGENTE en Configuración →
  Empresa **nace enlazado y listo** (vencido o faltante → pendiente). Firmante por defecto
  según criticidad (no subsanable → GG).
- Las filas del panel se agrupan por sobre; el alta manual queda para requisitos propios
  del pliego.

---

## 2026-07-15 — Entidades unificadas: la misma entidad al licitar y al recibir la OC

**Contexto:** Pablo explicó el dominio: la entidad convocante es LA MISMA persona jurídica
cuando se licita y cuando llega la orden de compra. El sistema las trataba como mundos
separados: licitaciones enlazaba al catálogo `institucion`, pero las órdenes guardaban el
nombre como texto suelto del OCR (22 órdenes, 19 nombres distintos, 0 enlazadas — y el
catálogo VACÍO).

**Hecho:**

- **Migración** (al final de `supabase_schema.sql`, aplicada en producción): `institucion`
  gana `rnc` y `direccion` (los formularios oficiales los piden); el catálogo se SIEMBRA
  desde el texto de las órdenes existentes (dedupe por nombre normalizado con unaccent) y
  las órdenes se enlazan por nombre. Resultado verificado: 19 entidades, 22/22 órdenes
  enlazadas.
- **`crearOrden` enlaza al nacer**: el nombre que extrae el OCR se empareja contra el
  catálogo (helper `normalizarEntidad` en types.ts — acentos/mayúsculas/espacios) y si no
  existe, se crea. Una orden nueva ya no queda suelta.
- **Configuración → Entidades**: CRUD nuevo con autosave (nombre, siglas, RNC, dirección),
  alta rápida, y dedupe por nombre normalizado al crear.

**Nota:** los contactos de institución que la orden muestra ahora encuentran su entidad de
forma confiable (antes el match por string fallaba con cualquier acento).

---

## 2026-07-15 — Fase 3, feedback de Pablo: bug de guardado, autosave y reubicación

**Contexto:** Pablo probó la Fase 3 en local. Tres devoluciones: errores al guardar los
datos de empresa, la configuración de empresa debe vivir en Configuración (no como pestaña
de Licitaciones), y debe guardar sola (autosave).

**El bug de guardado:** `export type { LicItem, ... }` al final de
`src/lib/actions/licitaciones.ts` — un archivo `"use server"`. El compilador de Next NO
borra ese re-export en módulos de server actions y el runtime revienta con
`ReferenceError: LicItem is not defined` al cargar el módulo → toda action de ese archivo
fallaba. `tsc` no lo atrapa (es TypeScript válido). **Regla nueva: nunca `export type` en
archivos "use server"; los tipos se importan de su módulo de origen.**

**Cambios:**

- Perfil fiscal + cotizador + firmantes movidos a **Configuración → Empresa**, junto a la
  documentación con vencimientos (todo lo de la empresa en un solo lugar). La pestaña
  Empresa de /licitaciones se eliminó (y sus enlaces apuntan al nuevo destino).
- **Autosave**: cada campo se guarda al salir de él (onBlur), con indicador
  Guardando…/Guardado. Elegir el modo de margen guarda al instante. `guardarPerfil` ahora
  acepta parches parciales y **auto-crea el perfil** con la razón social pre-poblada desde
  el nombre de la organización (no hay "formulario inicial" que llenar).
- **Subida de documentos rediseñada** (2º feedback): «Subir» en una fila abría un
  formulario aparte abajo de la página (fuera de vista) que re-preguntaba el tipo ya
  elegido. Ahora «Subir»/«Renovar» abre el selector de archivo DIRECTO (el tipo es la
  fila) y las fechas se piden ahí mismo, en la fila. El alta de documentos fuera del
  catálogo tiene su propia fila fija al final.
- Gotcha de React documentado en el código: un componente definido DENTRO de otro se
  remonta en cada render — con autosave + router.refresh() borraría texto a medio
  escribir. `Campo` vive fuera del componente.

---

## 2026-07-15 — Licitaciones Fase 3: captura manual, Bid Room y cotizador

**Contexto:** PR #6 (Fase 2) fusionado. El margen quedó sin decidir → el cotizador nace con
markup como default y la pestaña Empresa muestra LOS DOS cálculos en vivo (US$1,000 →
RD$X vs RD$Y) para elegir viéndolo; cambia con un clic y queda guardado por organización.

**Hecho:**

- **Herramienta completa `/licitaciones`** (entrada nueva en el menú): lista de procesos
  con cuenta regresiva al cierre (reusa los helpers de urgencia del tablero), formulario de
  proceso nuevo (crea la institución al vuelo si no existe), y la **Bid Room**: cabecera
  con contador del gate (rojo si hay no-subsanables pendientes), totales de la oferta en
  vivo, panel de ítems y checklist de requisitos.
- **Ítems**: spec del pliego tal cual (textarea sin adornos), lo ofertado aparte
  (marca/modelo/descripción afirmativa), y cotización de dos vías: **del catálogo de
  Precios** (buscador embebido sobre `buscarPreciosAction`; elegir congela costo→tasa→
  margen→precio en el ítem) o **manual** (teclear el precio limpia el snapshot del
  catálogo — un precio manual no finge venir de una lista).
- **Requisitos**: el flag subsanable/NO subsanable es el protagonista (toggle visible,
  default crítico), archivo por requisito a `{org}/licitaciones/{proceso}/…` (subir marca
  listo), firmante por rol.
- **Empresa**: perfil fiscal (fuente del snapshot `oferente`), tasa/margen/ITBIS, selector
  de modo de margen con ejemplo vivo, y firmantes (GG y GV) con nombre/cédula/cargo.
- **Endpoint canónico**: `GET /api/licitaciones/{id}/canonico` arma el JSON desde la base,
  lo valida contra el contrato de la Fase 1 y devuelve 422 con la lista legible de qué
  falta. El botón "Validar expediente" de la Bid Room usa lo mismo.
- 8 tests nuevos del cotizador (markup vs margen, redondeo del unitario, exentos, cascada
  de herencia). Total: 17 en verde.

**Pendiente:** el criterio de aceptación de la fase — cargar un expediente REAL completo en
~20 min con la sesión de Pablo y obtener el JSON canónico válido — necesita su prueba.
Luego: Fase 4 (motor documental: docxtemplater → Gotenberg → pdf-lib).

---

## 2026-07-14 — Licitaciones Fase 2: persistencia con aislamiento probado

**Contexto:** PR #5 (Fase 1) fusionado. Pablo confirmó el seed de capabilities.

**Hecho:**

- `supabase_licitaciones.sql` — 9 tablas: `empresa_perfil` (fuente del snapshot oferente +
  defaults del cotizador), `lic_proceso` (10 estados, unique org+codigo), `lic_lote`,
  `lic_item` (spec_cruda inmutable + cotizador congelado por línea), `lic_requisito`
  (subsanable **default false**, índice parcial para el gate), `lic_paquete` (payload +
  hash por versión), `lic_capability`, `lic_firmante` (rol → persona, con refs a
  documento_empresa para firma/sello), `lic_entidad_patron`. FK `orden.proceso_id` lista
  para la Fase 6. **Aplicada en producción** + seed de 11 vendors (sophos = blocker).
- **Test de aislamiento real**: transacción con dos orgs y un usuario solo miembro de A,
  simulando su JWT (`set local role authenticated` + `request.jwt.claims`) — A ve solo lo
  suyo, no lee lo de B, y el INSERT en la org ajena lo bloquea la RLS. Rollback al final:
  cero rastro (verificado).

**Decisiones no obvias:**

- `lic_entidad_patron` nace **org-scoped**; el patrón "global compartido entre tenants"
  queda diferido (exigiría catálogo global de entidades; hoy `institucion` es por org).
- Firmantes NO se sembraron: nombres/cédulas reales sin confirmar — se capturan por UI en
  la Fase 3. Solo se sembraron las capabilities confirmadas.
- `empresa_perfil` sin campos de representante: eso vive en `lic_firmante` por rol.

**Sigue:** Fase 3 — captura manual + Bid Room + endpoint canónico + cotizador. Pendiente
de Pablo: margen markup vs real (bloquea el default del cotizador en la Fase 3).

---

## 2026-07-14 — Licitaciones Fase 1: el contrato de datos (y los primeros tests del repo)

**Contexto:** PR #4 (plan + hallazgos) fusionado = Fase 0 aprobada. Pablo resolvió las dos
decisiones grandes: **firma con imagen escaneada**, y **la entidad entrega Word para
rellenar / se sube PDF firmado, con formato idéntico al oficial** → pipeline:
docxtemplater (Vercel) → Gotenberg docx→PDF (contenedor tonto) → pdf-lib estampa
firma/sello (Vercel) → ZIP.

**Hecho:**

- `src/lib/licitaciones/contrato.ts` — el schema canónico del proceso (Zod), con las
  4 reglas duras documentadas: `spec_cruda` inmutable (evidencia legal, ni un trim),
  `subsanable` default false (fail-safe), oferente/firmantes/cotizador como snapshot,
  firmantes por ROL (nunca nombres en enums). Validaciones cruzadas: una línea económica
  debe apuntar a un ítem ofertado; un ítem descartado exige motivo.
- **vitest bootstrapeado** — primer runner de tests del proyecto (`pnpm test`). 9 tests:
  caso real válido + los inválidos del plan (cierre sin hora, requisito sin firmante,
  spec_cruda vacía, precio negativo) + el default fail-safe y la no-normalización.
- Dependencias nuevas: `zod`, `vitest` (dev).

**Estado:** Fase 1 cumplida (el schema valida el ejemplo real y rechaza los inválidos).
Sigue Fase 2: `supabase_licitaciones.sql` (tablas `lic_*` + RLS + test de aislamiento).
Pendientes de Pablo: margen markup vs real, y confirmar seed de capabilities.

---

## 2026-07-14 — Módulo de Licitaciones: plan adoptado y Fase 0 entregada

**Contexto:** Pablo trajo un plan externo (`borrador-original.md`) para un módulo completo
de licitaciones (pre-adjudicación: expediente, requisitos subsanables/no-subsanables,
paquete firmado). Sustituye al plan de Formularios de la sesión en la nube, **cuyo PR
nunca llegó** — darlo por muerto.

**Hecho:**

- Revisión del borrador contra el repo real y plan corregido en `docs/licitaciones/plan.md`.
  Correcciones principales: la tabla `assets` que proponía **duplicaba `documento_empresa`**
  (se reutiliza y extiende con tipos firma/sello); firmantes por **rol** con mapeo por org,
  no nombres propios hardcodeados (`pablo_gg` en un enum de un SaaS multi-tenant);
  prefijo `lic_` obligatorio (`items` sin prefijo junto al `item` existente era confusión
  garantizada); el **cotizador** (Precios: costo USD → tasa → margen → ITBIS → DOP, con
  snapshot congelado por línea) injertado en `economico` — el borrador lo omitía;
  `.docx vs PDF firmado` elevado a decisión bloqueante de la Fase 4.
- **Fase 0 entregada**: `docs/licitaciones/00-hallazgos.md` — stack, tenancy, RLS, storage,
  qué se reutiliza (documento_empresa, institucion, producto_precio, helpers de urgencia),
  frontera del módulo, y las 5 decisiones que necesitan a Pablo.

**Pendiente (bloquea la Fase 1):** revisión humana de los hallazgos, y las decisiones:
(1) firma imagen vs certificada; (2) salida .docx vs PDF firmado vs mixto; (3) entidades
compartidas vs `institucion` actual (recomendado: mantener `institucion`); (4) margen
markup vs real; (5) confirmar seed de capabilities (sophos = blocker).

---

## 2026-07-14 — Los precios de los ítems de la OC se descartaban al crear la orden

**Contexto:** "en la orden recibida no puedo ver los precios que llegaron en la orden". El
OCR extraía bien el monto de cada ítem (quedaba en `orden.ocr_raw`), pero `crearOrden` solo
insertaba nombre/tipo/cantidad — el monto se tiraba. Todos los ítems quedaban sin precio.

**Arreglos:**

- `NuevaOrdenForm`: el borrador de ítem lleva `monto` (el OCR lo puebla, editable en el
  formulario de confirmación con su propia columna).
- `crearOrden`: inserta `precio` desde el monto (null si no viene o no es > 0).
- **Backfill en producción**: 38 ítems de 17 órdenes recuperaron su precio desde el JSON
  del OCR ya guardado (match por `orden_id` + `nombre`, solo donde `precio is null`).
  Auditados uno a uno contra el OCR de su propia orden: todos correctos. Los 2 precios
  tecleados a mano que ya existían no se tocaron.

**Lección técnica:** un `UPDATE ... FROM ... CROSS JOIN LATERAL` que referencia la tabla
objetivo dentro del LATERAL no correlaciona como uno espera (actualizó 1 de 38 sin error).
La forma segura: CTE con el SELECT ya probado + `UPDATE ... WHERE id = cte.id`. Siempre
ensayar con SELECT y comparar el conteo del UPDATE contra el ensayo.

---

## 2026-07-14 — Buscador de Precios: acentos rotos y 4 viajes por tecla

**Contexto:** "funciona muy mal y es lento". Se diagnosticó el camino completo y se midió
contra producción (24,216 productos): el SQL tarda 4–12 ms — la lentitud no estaba ahí.

**Causas encontradas (medidas):**

- **Acentos destruidos.** `precios_normalizar` trataba `[^a-zA-Z0-9]` como separador, y las
  vocales acentuadas/ñ no están en ese rango: `"cámara"` → tokens `c` + `mara`; `"3 años"`
  genera `'a':*` que casa con **15,431 de 24,216 productos**. Causa #1 de "no encuentra".
- **4 viajes a Supabase por tecla**: `auth.getUser()` (red) + `select miembro` en serie, y
  luego 2 RPC que hacían el mismo escaneo dos veces (búsqueda y facetas por separado).
- **El estado de carga existía pero nunca se renderizaba** — la UI se veía congelada.
- `categoria` no estaba en el índice de búsqueda.

**Arreglos:**

- `precios_normalizar` v2 translitera (á→a, ñ→n) en vez de destruir. La columna generada
  `busqueda` se reconstruye (no se recalcula sola al cambiar la función) — la migración lo
  detecta por la ausencia de `categoria` en la expresión, y agrega `categoria` de paso.
- `precios_tsquery` v2: tokens de 1 carácter van exactos, sin `:*` (un prefijo de una letra
  expande a medio índice GIN).
- **RPC nuevo `precios_buscar_full`**: búsqueda + facetas en un solo escaneo y una sola
  llamada. Los RPC viejos quedan por compatibilidad (obsoletos).
- **`orgActivaLigera()`** en `src/lib/auth.ts`: el org_id sale de la cookie sin viajes de
  red; el guard real es `es_miembro()` dentro del RPC (un org_id falsificado devuelve
  vacío). Solo para lecturas; las mutaciones siguen con `getMiembro()`. Resultado: **1 viaje
  por tecla** contra 4.
- Cliente: spinner en el input, resultados atenuados mientras busca, y caché de sesión
  (Map, 50 entradas) — repetir un término pinta al instante.

**Pendiente (bloqueante y ordenado):**

1. **Aplicar la migración a producción** (correr `supabase_precios.sql` completo, es
   re-ejecutable) — quedó denegada por permisos, necesita aprobación del usuario. **Sin
   esto el código nuevo no funciona** (llama a `precios_buscar_full`, que aún no existe).
2. Después: probar con sesión real, commitear y desplegar.
3. El PR #1 (documentación de empresa) sigue **sin fusionar** — el usuario esperaba verlo
   en producción; fusionar requiere su aprobación (denegado por permisos en esta sesión).

---

## 2026-07-13 — Documentación base de la empresa (con vencimientos)

**Contexto:** primer corte del frente de licitaciones, deliberadamente chico. Los documentos
legales de la empresa (RPE, DGII, TSS, registro mercantil, acta constitutiva) hay que
presentarlos en cada licitación y **casi todos vencen**. Si uno está vencido el día de la
apertura, la oferta se cae. No había nada en el sistema que lo vigilara.

**Hecho:**

- `supabase_empresa.sql` — tabla `documento_empresa` (org_id, tipo, fechas de emisión y
  vencimiento, path del archivo) con RLS `es_miembro(org_id)`. **Ya corrido en producción**
  (proyecto `yhuletcbkiolekuldleb`) vía la API de gestión de Supabase. Verificado: columnas,
  índices, RLS activa, la policy bloquea a un anónimo, y el round-trip de inserción funciona.
- `src/lib/empresa/documentos.ts` — catálogo fijo de 7 tipos + "Otro", umbrales de
  vencimiento y el cálculo de qué está vigente / qué falta.
- `src/lib/empresa/queries.ts`, `src/lib/actions/empresa.ts` — subir / editar fechas /
  eliminar.
- `src/app/(app)/configuracion/empresa/` — la pantalla (checklist).
- Insignia en el menú lateral (entrada "Empresa") con el conteo de documentos vencidos o por
  vencer. Solo aparece si de verdad hay algo.

**Decisiones no obvias:**

- **Tabla propia, no reusar `documento`.** `documento.orden_id` es `NOT NULL` y su RLS
  resuelve la organización *a través de la orden*: un documento de la empresa no cuelga de
  ninguna orden y no cabe ahí. Aflojarlo obligaba a reescribir la policy, hacer backfill y
  filtrar el ruido en el repositorio global de documentos.
- **Storage sin cambios.** Los archivos van al bucket `documentos` con ruta
  `{org_id}/empresa/{uuid}.{ext}`; la policy actual ya lo autoriza porque solo exige que el
  primer folder sea el `org_id`.
- **Umbrales propios: ámbar a 30 días, rojo a 15.** Los de las órdenes (2 y 5 días) sirven
  para una entrega, no para una certificación de la DGII que se tramita con semanas. Se
  reusan los colores y textos (`urgenciaChip`, `textoDias`), solo cambian los umbrales.
- **Varias filas por tipo, a propósito.** Renovar es subir la nueva, no borrar la vieja: el
  vigente es el de vencimiento más lejano y el resto queda como historial.
- **El catálogo es fijo** para poder mostrar lo que **falta**, no solo lo que hay cargado.

**Pendiente:**

- Verificar el ciclo completo con la sesión real: subir un PDF, ver el color, renovar y ver
  bajar la insignia. (Todo lo demás ya está verificado contra la base de producción.)

---

## 2026-07-13 — Reconstrucción del entorno en laptop nueva

**Contexto:** Pablo cambió de laptop. El proyecto no existía en local y la máquina no tenía
ni Node instalado.

**Hecho:**

- Clonado `github.com/ithesk/adjudicado.app` en `~/Documents/DEVPABLO/adjudicado`.
- Instalados Node 26 y pnpm 11 (Homebrew) + dependencias del proyecto.
- Recuperadas las llaves. **No están en el repo** (`.env*` va en `.gitignore` y el
  `.env.example` que menciona el README no existe). Se bajaron del proyecto de Vercel:

  ```bash
  pnpm dlx vercel link --yes --project adjudicado-app
  pnpm dlx vercel env pull .env.local --environment=production
  ```

- Arreglado `pnpm-workspace.yaml`: estaba commiteado con los marcadores sin resolver
  (`sharp: set this to true or false`), lo que hacía fallar `pnpm dev` en el chequeo de
  dependencias. Ahora aprueba los builds de `sharp` (optimización de imágenes de Next) y
  `unrs-resolver` (ESLint). **Único cambio de código de la sesión.**
- Verificado: `pnpm dev` levanta y `/`, `/inicio` y `/login` responden 200.

**Hallazgos que sorprenden (no están en el README):**

- En producción **no hay `ANTHROPIC_API_KEY`; hay `OPENAI_API_KEY`.** `src/lib/env.ts`
  elige el proveedor de OCR por precedencia OpenAI → Gemini → Claude, así que **el OCR
  corre hoy con OpenAI**, aunque el README siga diciendo Claude. El README quedó desfasado.
- Enrutamiento (`src/proxy.ts` + `src/lib/supabase/session.ts`): un visitante anónimo que
  entra a `/` recibe la landing por *rewrite* a `/inicio`; con sesión activa, `/` es el
  tablero. La landing no vive en `/`.

**Pendiente / próximo paso:**

- **La capa de planes del SaaS no está fusionada.** La rama `claude/missing-saas-code-1gdj9u`
  tiene `src/lib/planes.ts` (planes Equipo RD$2,500/mes, Empresa, Corporativo; límites de
  miembros, órdenes vivas y OCR/mes; 14 días de prueba) y `supabase_saas.sql` (columnas
  `plan`, `estado_cuenta`, `trial_ends_at` en `organizacion`). Hoy quien se registra crea su
  organización **sin plan ni período de prueba**. La landing y el registro de esa rama, en
  cambio, ya están obsoletos: `main` los rehízo por su cuenta. **Rescatar solo planes + SQL,
  no la UI.**
- Sin cablear a persistencia (ya listado en `DEPLOY.md`): edición en vivo de campos del
  ítem, reacciones y comentarios de la bitácora, y el CRUD del catálogo de suplidores.
