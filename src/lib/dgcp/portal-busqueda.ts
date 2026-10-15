// Buscador y ficha de procesos en el PORTAL de ComprasDominicana, sin login.
//
// Por qué existe: la API de datos abiertos (api.ts) es una copia que va con
// retraso. El 15-10-2026 a las 8:30 su proceso más nuevo era de la víspera a
// las 18:00 y faltaban los 20 publicados esa mañana (MIMARENA-DAF-CM-2026-0125
// entre ellos, visible en el portal desde las 8:00). Además responde 502 de vez
// en cuando. El portal publica al instante y su buscador público contesta a
// peticiones normales con una sesión anónima (comprobado oct-2026):
//
//   GET  /Public/Tendering/ContractNoticeManagement/Index
//        → cookies de sesión + «mkey» (clave de la sesión, va en cada URL)
//   GET  …/ContractNoticeManagement/AdvancedSearchAjax?mkey=…&reference=…
//        &description=…&officialPublishDateFrom=dd/MM/yyyy&officialPublishDateTo=…
//        → primera página (100). OJO: el «To» es EXCLUSIVO (poner mañana).
//   POST …/ContractNoticeManagement/ResultListGoToPage?mkey=… startIdx=100,200…
//        → siguientes páginas, con los MISMOS filtros en el cuerpo.
//   GET  /Public/Tendering/OpportunityDetail/Index?noticeUID=DO1.NTC.n
//        → ficha: referencia, título, monto, cronograma, lotes/artículos, documentos.
//   GET  /Public/Archive/RetrieveFile/Index?DocumentId=<id>&InCommunity=False
//        &InPaymentGateway=False&DocUniqueIdentifier=   → el archivo, sin sesión.
//
// La sesión caduca a los ~20 min de inactividad («The content of this page has
// expired»): se abre una por operación. Sin el mkey, AdvancedSearchAjax
// devuelve una página de error con «Object reference not set».
//
// El HTML se lee por los `id` de Vortal (estables desde hace años); no hay
// parser de HTML porque los fragmentos son planos. Si el portal cambia, los
// parsers devuelven vacío y fuentes.ts lo dice en vez de callar.

import type { DgcpArticulo, DgcpDocumento, DgcpProceso } from "./api";
import { paginaPortal, type OpcionesPortal } from "./portal";

export const PORTAL = "https://comunidad.comprasdominicana.gob.do";
const BUSCADOR = `${PORTAL}/Public/Tendering/ContractNoticeManagement`;
const FICHA = `${PORTAL}/Public/Tendering/OpportunityDetail`;

export interface AvisoPortal {
  codigo: string;
  institucion: string;
  titulo: string;
  /** Fase de Vortal, p. ej. "ProcedureProfile_DGCP-01-ComprasMenores_Phase_TenderingPhase_Label". */
  fase: string | null;
  /** ISO con -04:00 (el portal muestra hora de RD). */
  publicado: string | null;
  cierre: string | null;
  monto: number | null;
  divisa: string | null;
  /** "Published", "ClosedForReplies", "Awarded"… */
  estado: string;
  /** "DO1.NTC.1784801": la clave de la ficha. */
  uid: string | null;
}

export interface DocumentoPortal {
  nombre: string;
  tipo: string;
  /** DocumentId del archivo (sirve para bajarlo sin sesión). */
  fileId: string;
}

export interface ArticuloPortal {
  lote: number | null;
  lote_nombre: string | null;
  referencia: number | null;
  unspsc: string | null;
  unspsc_descripcion: string | null;
  cuenta: string | null;
  descripcion: string;
  cantidad: number | null;
  unidad: string | null;
  precio_unitario: number | null;
  precio_total: number | null;
}

export interface FichaPortal {
  uid: string;
  codigo: string;
  titulo: string;
  descripcion: string | null;
  institucion: string | null;
  modalidad: string | null;
  estado: string | null;
  fase: string | null;
  monto: number | null;
  divisa: string | null;
  tipo_contrato: string | null;
  lugar: string | null;
  cronograma: { etapa: string; fecha: string | null }[];
  publicado: string | null;
  cierre: string | null;
  apertura: string | null;
  adjudicacion: string | null;
  lotes: { numero: number; nombre: string | null }[];
  articulos: ArticuloPortal[];
  documentos: DocumentoPortal[];
  mkey: string | null;
}

// ===== Lectura de HTML =====

// Las entidades con nombre que el portal usa (lo demás llega en UTF-8).
const ENTIDADES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", uuml: "ü",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", Uuml: "Ü",
  iquest: "¿", iexcl: "¡", ordm: "º", ordf: "ª", deg: "°", ndash: "–", mdash: "—", hellip: "…",
};

/** Texto plano de un fragmento HTML: sin etiquetas, entidades resueltas, espacios colapsados. */
export function limpiar(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTIDADES[e] ?? ENTIDADES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Contenido de la etiqueta cuyo id TERMINA en `idFinal` (los ids de Vortal
// llevan el camino completo: tblMainTable_…_spnMatchingResultReference_0).
function span(html: string, idFinal: string): string | null {
  const m = new RegExp(`id="[^"]*${escapar(idFinal)}"[^>]*>([\\s\\S]*?)</(?:span|label|div|td)>`).exec(html);
  return m ? limpiar(m[1]) : null;
}

/** "15/10/2026 08:00:15" (hora de RD) → "2026-10-15T08:00:15-04:00". */
export function fechaPortal(texto: string | null): string | null {
  const m = texto && /(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(texto);
  if (!m) return null;
  const [, d, mo, y, h = "00", mi = "00", s = "00"] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}-04:00`;
}

/** "1,942,500 Dominican Pesos" → { monto: 1942500, divisa: "DOP" }. */
export function montoPortal(texto: string | null): { monto: number | null; divisa: string | null } {
  const m = texto && /([\d,]+(?:\.\d+)?)\s*(.*)$/.exec(texto.trim());
  if (!m) return { monto: null, divisa: null };
  const monto = Number(m[1].replace(/,/g, ""));
  const t = m[2].toLowerCase();
  const divisa = /dominican|peso|dop/.test(t)
    ? "DOP"
    : /dollar|usd|d[oó]lar/.test(t)
      ? "USD"
      : /euro/.test(t)
        ? "EUR"
        : t
          ? t.toUpperCase()
          : null;
  return { monto: Number.isFinite(monto) ? monto : null, divisa };
}

function numero(texto: string | null): number | null {
  if (!texto) return null;
  const n = Number(texto.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && texto.trim() !== "" ? n : null;
}

/** Las filas del listado del buscador (una página). */
export function parsearListado(html: string): { avisos: AvisoPortal[]; hayMas: boolean; caducado: boolean } {
  // Al caducar, el portal manda un script que redirige a su página de error
  // (el mensaje viene codificado en la URL, con «+» por espacios).
  const caducado = /page(\+| )has(\+| )expired/i.test(html);
  const avisos: AvisoPortal[] = [];
  // Los índices de fila siguen la paginación: la página 2 trae _100 … _199.
  const indices = [...new Set([...html.matchAll(/spnMatchingResultReference_(\d+)"/g)].map((m) => Number(m[1])))].sort(
    (a, b) => a - b,
  );
  for (const i of indices) {
    const codigo = span(html, `spnMatchingResultReference_${i}`);
    if (!codigo) continue;
    const uid = new RegExp(`lnkDetailLink_${i}"[^>]*'noticeUID=' \\+ '(DO1\\.NTC\\.\\d+)'`).exec(html)?.[1] ?? null;
    const { monto, divisa } = montoPortal(span(html, `cbxBasePriceValue_${i}`));
    avisos.push({
      codigo,
      institucion: span(html, `spnMatchingResultAuthorityName_${i}`) ?? "",
      titulo: span(html, `spnMatchingResultDescription_${i}`) ?? "",
      fase: span(html, `spnMatchingResultPhaseCode_${i}`),
      publicado: fechaPortal(span(html, `dtmbNationalOfficialPublishingDate_${i}_txt`)),
      cierre: fechaPortal(span(html, `dtmbDueDateForReceivingReplies_${i}_txt`)),
      monto,
      divisa,
      estado: span(html, `spnMatchingResultContractNoticeState_${i}`) ?? "",
      uid,
    });
  }
  return { avisos, hayMas: /Paginator_goToPage_MoreItems/.test(html), caducado };
}

// El valor de una fila «Etiqueta: | Valor» del resumen de la ficha, por el
// id de la fila (trRowRef, trRowName, trRowBuyer…): no depende del idioma.
function filaResumen(html: string, id: string): string | null {
  const m = new RegExp(`<tr id="[^"]*_trRow${escapar(id)}"[\\s\\S]*?</tr>`).exec(html);
  if (!m) return null;
  const celdas = [...m[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => limpiar(c[1]));
  return celdas[1] || null;
}

const ETAPA_CIERRE = /presentaci[oó]n de (ofertas?|propuestas?)|recepci[oó]n de (ofertas?|propuestas?)/i;

/** La ficha de un aviso (OpportunityDetail). null si la página no es una ficha. */
export function parsearFicha(html: string, uid: string): FichaPortal | null {
  const codigo = span(html, "spnRequestReference");
  if (!codigo) return null;

  const cronograma = [...html.matchAll(/<tr id="trScheduleDateRow_(\d+)">([\s\S]*?)<\/tr>/g)].map((m) => ({
    etapa: span(m[2], `lblScheduleDateTimeLabel_${m[1]}`) ?? "",
    fecha: fechaPortal(/DateTimeDetail">\(?([\d/: ]+)/.exec(m[2])?.[1] ?? null),
  }));
  const etapa = (re: RegExp) => cronograma.find((c) => re.test(c.etapa))?.fecha ?? null;

  const documentos: DocumentoPortal[] = [];
  for (let i = 0; i < 500; i++) {
    const nombre = span(html, `spnDocumentName_${i}`);
    if (!nombre) break;
    const fileId = new RegExp(`lnkDownloadLinkP3Gen_${i}"[^>]*'documentFileId=' \\+ '(\\d+)'`).exec(html)?.[1];
    if (!fileId) continue;
    documentos.push({ nombre, tipo: span(html, `spnDocumentTypeSpan_${i}`) || "Otro", fileId });
  }

  // Cuestionario: filas OTLN (lotes) y BILN (artículos y subtotales), en orden.
  const lotes: FichaPortal["lotes"] = [];
  const articulos: ArticuloPortal[] = [];
  const filas = [...html.matchAll(/<tr id="incQuestionnaireDO1_(OTLN|BILN)_(\d+)" class="([^"]*)"/g)];
  let loteActual: { numero: number; nombre: string | null } | null = null;
  filas.forEach((m, i) => {
    const seg = html.slice(m.index!, filas[i + 1]?.index ?? html.length);
    const [, tipo, n, clase] = m;
    if (tipo === "OTLN") {
      const numero = Number(/LotOptions"><span[^>]*>\s*Lote\s*(\d+)/i.exec(seg)?.[1]);
      const nombre = limpiar(/MainLineContentCell"><span[^>]*>([^<]*)/.exec(seg)?.[1] ?? "") || null;
      loteActual = Number.isFinite(numero) ? { numero, nombre } : null;
      if (loteActual) lotes.push(loteActual);
      return;
    }
    if (/GrandTotal/.test(clase)) return;
    // Un texto largo viene recortado con «(...)» y el completo en un span oculto.
    const descripcion =
      span(seg, `BILN_${n}_Description_fullMessage`) ?? span(seg, `BILN_${n}_Description`)?.replace(/\s*\(\.\.\.\)\s*$/, "");
    if (!descripcion) return;
    const cat = /title="(\d{6,8}) - ([^"]*)"/.exec(seg);
    articulos.push({
      lote: loteActual?.numero ?? null,
      lote_nombre: loteActual?.nombre ?? null,
      referencia: numero(span(seg, `BILN_${n}_ItemCode_shortMessage`)),
      unspsc: cat?.[1] ?? null,
      unspsc_descripcion: cat ? limpiar(cat[2]) : null,
      cuenta: span(seg, `BILN_${n}_AccountCode`),
      descripcion,
      cantidad: numero(span(seg, `BILN_${n}_Quantity`)),
      unidad: span(seg, `BILN_${n}_Unit`),
      precio_unitario: numero(span(seg, `BILN_${n}_CeilingPrice`)),
      precio_total: numero(span(seg, `BILN_${n}_CeilingPriceTotal`)),
    });
  });

  const { monto, divisa } = montoPortal(filaResumen(html, "BasePrice"));
  return {
    uid,
    codigo,
    titulo: filaResumen(html, "Name") ?? "",
    descripcion: filaResumen(html, "Description"),
    institucion: filaResumen(html, "Buyer"),
    modalidad: filaResumen(html, "ProcedureType"),
    estado: filaResumen(html, "State"),
    fase: filaResumen(html, "Phase"),
    monto,
    divisa,
    tipo_contrato: filaResumen(html, "TypeOfContract"),
    lugar: filaResumen(html, "PlaceOfWorks"),
    cronograma,
    publicado: etapa(/publicaci[oó]n del aviso|publicaci[oó]n de la convocatoria/i),
    cierre: etapa(ETAPA_CIERRE),
    apertura: etapa(/apertura/i),
    adjudicacion: etapa(/acto de adjudicaci[oó]n/i),
    lotes,
    articulos,
    documentos,
    mkey: /mkey=([a-z0-9_]{30,})/.exec(html)?.[1] ?? null,
  };
}

// ===== Conversión a las formas de la API (lo demás de la app no distingue) =====

const ESTADO_API: Record<string, string> = {
  Published: "Proceso publicado",
  ClosedForReplies: "Proceso con etapa cerrada",
  Awarded: "Proceso adjudicado y celebrado",
  Cancelled: "Cancelado",
  Canceled: "Cancelado",
  Deserted: "Proceso desierto",
};

const esMipyme = (titulo: string) => (/mipyme|mypime|mipymes/i.test(titulo) ? "Si" : "No");

export function urlFicha(uid: string): string {
  return `${FICHA}/Index?noticeUID=${uid}`;
}

/** Un aviso del listado como DgcpProceso (lo que se sabe sin abrir la ficha). */
export function avisoAProceso(a: AvisoPortal): DgcpProceso {
  return {
    codigo_proceso: a.codigo,
    unidad_compra: a.institucion,
    modalidad: modalidadDesdeFase(a.fase) ?? "",
    titulo: a.titulo,
    descripcion: null,
    estado_proceso: ESTADO_API[a.estado] ?? a.estado,
    divisa: a.divisa,
    monto_estimado: a.monto,
    fecha_publicacion: a.publicado,
    fecha_fin_recepcion_ofertas: a.cierre,
    fecha_apertura_ofertas: null,
    fecha_estimada_adjudicacion: null,
    dirigido_mipymes: esMipyme(a.titulo),
    dirigido_mipymes_mujeres: /mujer/i.test(a.titulo) ? "Si" : "No",
    proceso_lotificado: null,
    objeto_proceso: null,
    url: a.uid ? urlFicha(a.uid) : null,
  };
}

// "ProcedureProfile_DGCP-01-ComprasMenores_Phase_…" → el nombre de la modalidad.
const MODALIDAD_FASE: [RegExp, string][] = [
  [/ComprasMenores/, "Contratación Menor"],
  [/ComprasDebajoUmbral/, "Compras por Debajo del Umbral"],
  [/ComparacionPrecios/, "Comparación de Precios"],
  [/LicitacionPublicaNacional/, "Licitación Pública Nacional"],
  [/LicitacionPublicaInternacional/, "Licitación Pública Internacional"],
  [/LicitacionRestringida/, "Licitación Restringida"],
  [/SorteoObras/, "Sorteo de Obras"],
  [/SubastaInversa/, "Subasta Inversa"],
  [/ProcesosExcepcion|Excepcion/, "Procesos de Excepción"],
];
export function modalidadDesdeFase(fase: string | null): string | null {
  if (!fase) return null;
  return MODALIDAD_FASE.find(([re]) => re.test(fase))?.[1] ?? null;
}

/** La ficha (y, si se tiene, su fila del listado) como DgcpProceso. */
export function fichaAProceso(f: FichaPortal, aviso?: AvisoPortal | null): DgcpProceso {
  const titulo = f.titulo || aviso?.titulo || "";
  return {
    codigo_proceso: f.codigo,
    unidad_compra: f.institucion ?? aviso?.institucion ?? "",
    modalidad: f.modalidad ?? modalidadDesdeFase(aviso?.fase ?? null) ?? "",
    titulo,
    descripcion: f.descripcion,
    estado_proceso: ESTADO_API[f.estado ?? aviso?.estado ?? ""] ?? f.estado ?? aviso?.estado ?? "",
    divisa: f.divisa ?? aviso?.divisa ?? null,
    monto_estimado: f.monto ?? aviso?.monto ?? null,
    fecha_publicacion: f.publicado ?? aviso?.publicado ?? null,
    fecha_fin_recepcion_ofertas: f.cierre ?? aviso?.cierre ?? null,
    fecha_apertura_ofertas: f.apertura,
    fecha_estimada_adjudicacion: f.adjudicacion,
    dirigido_mipymes: esMipyme(titulo),
    dirigido_mipymes_mujeres: /mujer/i.test(titulo) ? "Si" : "No",
    proceso_lotificado: f.lotes.length > 1 ? "Si" : "No",
    objeto_proceso: f.tipo_contrato,
    url: urlFicha(f.uid),
  };
}

export function articulosDe(f: FichaPortal): (DgcpArticulo & { lote: number | null; lote_nombre: string | null })[] {
  return f.articulos.map((a) => ({
    descripcion_articulo: a.unspsc_descripcion ?? a.descripcion,
    descripcion_usuario: a.descripcion,
    cantidad: a.cantidad ?? 1,
    unidad_medida: a.unidad,
    precio_unitario_estimado: a.precio_unitario,
    precio_total_estimado: a.precio_total,
    subclase_unspsc: a.unspsc,
    lote: a.lote,
    lote_nombre: a.lote_nombre,
  }));
}

/** URL de descarga de un archivo del portal (sin sesión; es la misma forma que usa la API). */
export function urlDocumento(fileId: string): string {
  return `${PORTAL}/Public/Archive/RetrieveFile/Index?DocumentId=${fileId}&InCommunity=False&InPaymentGateway=False&DocUniqueIdentifier=`;
}

export function documentosDe(f: FichaPortal): DgcpDocumento[] {
  return f.documentos.map((d) => ({
    nombre_documento: d.nombre,
    tipo_documento: d.tipo,
    fecha_carga_archivo: null,
    url_documento: urlDocumento(d.fileId),
  }));
}

// ===== Red =====

export interface SesionPortal {
  cookies: string;
  mkey: string;
}

const UA = "Mozilla/5.0 (compatible; adjudicado.app)";

function cabeceras(s?: SesionPortal): Record<string, string> {
  return {
    "user-agent": UA,
    "x-requested-with": "XMLHttpRequest",
    ...(s?.cookies ? { cookie: s.cookies } : {}),
  };
}

export async function abrirSesion(): Promise<SesionPortal> {
  const { texto, cookies } = await paginaPortal(`${BUSCADOR}/Index`, { headers: { "user-agent": UA } });
  const mkey = /ResultListGoToPage\?mkey=([a-z0-9_]+)/.exec(texto)?.[1];
  if (!mkey) throw new Error("El buscador del portal cambió: no encuentro la clave de sesión (mkey).");
  return { cookies: cookies.join("; "), mkey };
}

// Los parámetros que el buscador manda siempre (copiados de su JavaScript).
const PARAMETROS_FIJOS: Record<string, string> = {
  perspective: "All",
  initAction: "Index",
  externalId: "",
  logicalId: "",
  fromMarketplace: "",
  authorityVat: "",
  allWords2Search: "",
  exactPhrase2Search: "",
  oneOrMoreWords2Search: "",
  wordsToExclude2Search: "",
  currentPagingStyle: "0",
  displayAdvancedParams: "true",
  orderParam: "RequestOnlinePublishingDateDESC",
  searchExecuted: "True",
  authorityCompanyCode: "",
  authorityCompanyCodeText: "",
  mainCategory: "",
  mainCategoryText: "",
  categorizationSystemCode: "UNSPSC",
  country: "DO",
  region: "",
  regulation: "",
  procedure: "",
  requestStatus: "",
};

const DIA_MS = 86_400_000;
const RD_MS = -4 * 3_600_000;

/** dd/MM/yyyy del día de RD en que cae la fecha. */
export function diaRd(d: Date): string {
  const iso = new Date(d.getTime() + RD_MS).toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export interface FiltroAvisos {
  /** Referencia exacta del proceso. */
  codigo?: string;
  /** Palabras en la descripción. */
  texto?: string;
  /** Publicados desde este instante (se manda el día de RD). */
  desde?: Date;
  /** Publicados hasta este instante, INCLUSIVE (se manda el día siguiente: el portal excluye el «To»). */
  hasta?: Date;
}

function parametros(f: FiltroAvisos): Record<string, string> {
  return {
    ...PARAMETROS_FIJOS,
    reference: f.codigo ?? "",
    description: f.texto ?? "",
    officialPublishDateFrom: f.desde ? diaRd(f.desde) : "",
    officialPublishDateTo: f.hasta ? diaRd(new Date(f.hasta.getTime() + DIA_MS)) : "",
  };
}

/**
 * Avisos del buscador, de más nuevo a más viejo, 100 por página.
 * `parar(pagina)` corta la paginación cuando una página ya trae lo que se buscaba.
 */
export async function buscarAvisos(
  s: SesionPortal,
  f: FiltroAvisos,
  maxPaginas = 10,
  parar?: (pagina: AvisoPortal[]) => boolean,
): Promise<{ avisos: AvisoPortal[]; paginas: number; hayMas: boolean }> {
  const p = parametros(f);
  const primera = await paginaPortal(
    `${BUSCADOR}/AdvancedSearchAjax?mkey=${s.mkey}&startIndex=1&endIndex=100&${new URLSearchParams(p)}`,
    { headers: cabeceras(s) },
  );
  const inicial = parsearListado(primera.texto);
  if (inicial.caducado) throw new Error("La sesión del buscador del portal caducó; vuelve a intentarlo.");
  let { avisos, hayMas } = inicial;
  if (avisos.length === 0 && /Object reference not set|ErrorPage/.test(primera.texto)) {
    throw new Error("El buscador del portal rechazó la consulta (¿cambió el formulario?).");
  }
  const todos = [...avisos];
  let paginas = 1;
  while (hayMas && paginas < maxPaginas && !parar?.(avisos)) {
    const desde = paginas * 100;
    const cuerpo = new URLSearchParams({
      startIdx: String(desde),
      endIdx: String(desde + 99),
      pageNumber: String(paginas),
      startIndex: "1",
      endIndex: "100",
      ...p,
    }).toString();
    const r = await paginaPortal(`${BUSCADOR}/ResultListGoToPage?mkey=${s.mkey}`, { headers: cabeceras(s), cuerpo });
    const l = parsearListado(r.texto);
    if (l.caducado) throw new Error("La sesión del buscador del portal caducó a mitad de la paginación.");
    if (l.avisos.length === 0) {
      hayMas = false;
      break;
    }
    todos.push(...l.avisos);
    avisos = l.avisos;
    hayMas = l.hayMas;
    paginas++;
  }
  return { avisos: todos, paginas, hayMas: hayMas && !parar?.(avisos) };
}

/** Un aviso por su referencia exacta (o null si el portal no lo tiene). */
export async function avisoPorCodigo(s: SesionPortal, codigo: string): Promise<AvisoPortal | null> {
  const { avisos } = await buscarAvisos(s, { codigo }, 1);
  const objetivo = codigo.trim().toLowerCase();
  return avisos.find((a) => a.codigo.trim().toLowerCase() === objetivo) ?? null;
}

/** La ficha completa de un aviso. */
export async function leerFicha(uid: string): Promise<FichaPortal> {
  const op: OpcionesPortal = { headers: { "user-agent": UA } };
  const { texto } = await paginaPortal(urlFicha(uid), op);
  const ficha = parsearFicha(texto, uid);
  if (!ficha) {
    if (/out of the range of valid values|An error has occurred/i.test(texto)) {
      throw new Error(`El portal no tiene un aviso con noticeUID ${uid}.`);
    }
    throw new Error("La ficha del portal cambió de formato: no encuentro la referencia del proceso.");
  }
  return ficha;
}

/** El noticeUID dentro de un enlace del portal o suelto; null si no hay. */
export function uidDe(texto: string): string | null {
  return /DO1\.NTC\.\d+/i.exec(texto)?.[0].toUpperCase() ?? null;
}
