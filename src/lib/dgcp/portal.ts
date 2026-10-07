// Lectura del portal PÚBLICO de ComprasDominicana (comunidad.comprasdominicana.gob.do),
// sin login, para cubrir lo que la API de datos abiertos todavía no tiene.
//
// Por qué hace falta (oct-2026): la API de datos abiertos se actualiza con
// ~1 día de atraso. MINISTERIO HACIENDA-DAF-CM-2026-0098 se publicó el 7-oct a
// las 11:30 y a las 12:45 la API seguía terminando en lo publicado el 6-oct a
// las 14:00: ni el radar ni ver_proceso lo veían. El portal lo muestra al minuto.
//
// Lo que se aprendió probándolo, para no volver a tropezar:
//   - El listado (ContractNoticeManagement/Index) viene ordenado por fecha de
//     publicación, de 100 en 100. Las páginas siguientes se piden con POST a
//     ResultListGoToPage, EN ORDEN y con la cookie de sesión del Index; sin
//     ella (o saltando páginas) responde 200 con la tabla vacía.
//   - AdvancedSearchAjax?reference=… busca por código y acepta el código
//     incompleto ("HACIENDA-DAF-CM-2026-0098" encuentra
//     "MINISTERIO HACIENDA-DAF-CM-2026-0098"). Tarda ~1 s.
//   - El detalle (OpportunityDetail/Index?noticeUID=…) se lee sin sesión y trae
//     artículos, documentos y cronograma. Los documentos se bajan con el mismo
//     RetrieveFile de la API usando su documentFileId.
//   - El portal responde en inglés ("Published", "Dominican Pesos") y las fechas
//     vienen como "dd/mm/aaaa hh:mm" en hora de RD (UTC−4).
//   - Cada página pesa ~450 KB y tarda ~3 s.

import type { DgcpArticulo, DgcpDocumento, DgcpProceso } from "./api";

export const PORTAL = "https://comunidad.comprasdominicana.gob.do";

export interface AvisoPortal {
  codigo: string;
  entidad: string;
  titulo: string;
  fase: string;
  /** ISO UTC. */
  publicado: string | null;
  /** Cierre de recepción de ofertas, ISO UTC. */
  cierre: string | null;
  monto: number | null;
  divisa: string | null;
  /** "Published", "ClosedForReplies"… tal cual lo da el portal. */
  estado: string;
  noticeUID: string;
}

export interface DetallePortal {
  proceso: DgcpProceso;
  articulos: DgcpArticulo[];
  documentos: DgcpDocumento[];
  cronograma: { actividad: string; fecha: string | null }[];
}

// ─── Parseo (funciones puras, probadas en portal.test.ts) ───────────────────

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function texto(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(\w+);/g, (m, n) => ENTIDADES[n] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

// "07/10/2026 11:30" (hora de RD) → ISO UTC.
export function fechaPortal(s: string | null | undefined): string | null {
  const m = s?.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [, d, mes, a, h, mi] = m.map(Number);
  return new Date(Date.UTC(a, mes - 1, d, h + 4, mi)).toISOString();
}

// "436,000 Dominican Pesos" / "1,250.50 US Dollar" → monto y divisa.
export function montoPortal(s: string | null | undefined): { monto: number | null; divisa: string | null } {
  const t = texto(s ?? "");
  const n = t.match(/[\d,]+(?:\.\d+)?/);
  const monto = n ? Number(n[0].replace(/,/g, "")) : null;
  const divisa = /dollar|d[oó]lar|USD/i.test(t) ? "USD" : /peso|DOP/i.test(t) ? "DOP" : null;
  return { monto: Number.isFinite(monto) ? monto : null, divisa };
}

// Contenido del elemento cuyo id termina en `sufijo` (span, label, div…).
function porId(html: string, sufijo: string): string | null {
  const re = new RegExp(`id="[^"]*${sufijo}"[^>]*>([\\s\\S]*?)</(?:span|label|div|td|a)>`);
  const m = html.match(re);
  return m ? texto(m[1]) : null;
}

export function parsearListado(html: string): AvisoPortal[] {
  const avisos: AvisoPortal[] = [];
  const filas = html.split(/<tr id="[^"]*grdResultList_tr\d+"/).slice(1);
  for (const f of filas) {
    const codigo = porId(f, "spnMatchingResultReference_\\d+");
    const uid = f.match(/noticeUID='\s*\+\s*'([^']+)'/)?.[1];
    if (!codigo || !uid) continue;
    const { monto, divisa } = montoPortal(porId(f, "cbxBasePriceValue_\\d+"));
    avisos.push({
      codigo,
      entidad: porId(f, "spnMatchingResultAuthorityName_\\d+") ?? "",
      titulo: porId(f, "spnMatchingResultDescription_\\d+") ?? "",
      fase: porId(f, "spnMatchingResultPhaseCode_\\d+") ?? "",
      publicado: fechaPortal(porId(f, "dtmbNationalOfficialPublishingDate_\\d+_txt")),
      cierre: fechaPortal(porId(f, "dtmbDueDateForReceivingReplies_\\d+_txt")),
      monto,
      divisa,
      estado: porId(f, "spnMatchingResultContractNoticeState_\\d+") ?? "",
      noticeUID: uid,
    });
  }
  return avisos;
}

export function abierto(a: AvisoPortal): boolean {
  return /^(published|publicado)$/i.test(a.estado.trim());
}

// Modalidad con el nombre que usa la API (el radar y la app la leen así).
const MODALIDAD_SEGMENTO: Record<string, string> = {
  CM: "Contratación Menor",
  CD: "Compras por Debajo del Umbral",
  CP: "Comparación de Precios",
  LPN: "Licitación Pública Nacional",
  LPI: "Licitación Pública Internacional",
  LPA: "Licitación Pública Abreviada",
  SI: "Subasta Inversa",
  SB: "Subasta Inversa",
  PEPU: "Procesos de Excepción",
};

export function modalidadPortal(codigo: string, respaldo: string | null): string {
  for (const s of codigo.toUpperCase().split("-")) if (MODALIDAD_SEGMENTO[s]) return MODALIDAD_SEGMENTO[s];
  return respaldo ?? "";
}

export function urlDetalle(noticeUID: string): string {
  return `${PORTAL}/Public/Tendering/OpportunityDetail/Index?noticeUID=${encodeURIComponent(noticeUID)}`;
}

export function urlDocumento(documentFileId: string): string {
  return `${PORTAL}/Public/Archive/RetrieveFile/Index?DocumentId=${documentFileId}&InCommunity=False&InPaymentGateway=False&DocUniqueIdentifier=`;
}

// Un aviso del listado con la forma de la API, para que el radar y el MCP no
// distingan de dónde vino.
export function avisoAProceso(a: AvisoPortal, extra: Partial<DgcpProceso> = {}): DgcpProceso {
  return {
    codigo_proceso: a.codigo,
    unidad_compra: a.entidad,
    modalidad: modalidadPortal(a.codigo, null),
    titulo: a.titulo,
    descripcion: null,
    estado_proceso: abierto(a) ? "Proceso publicado" : a.estado,
    divisa: a.divisa,
    monto_estimado: a.monto,
    fecha_publicacion: a.publicado,
    fecha_fin_recepcion_ofertas: a.cierre,
    fecha_apertura_ofertas: null,
    fecha_estimada_adjudicacion: null,
    dirigido_mipymes: null,
    dirigido_mipymes_mujeres: null,
    proceso_lotificado: null,
    objeto_proceso: null,
    url: urlDetalle(a.noticeUID),
    ...extra,
  };
}

export function parsearDetalle(html: string, aviso: AvisoPortal): DetallePortal {
  // Cronograma: cada fila trae la actividad y "(13/10/2026 11:30:00(UTC-04:00) …)".
  const cronograma: DetallePortal["cronograma"] = [];
  for (const m of html.matchAll(/<tr id="trScheduleDateRow_\d+">([\s\S]*?)<\/tr>/g)) {
    const actividad = porId(m[1], "lblScheduleDateTimeLabel_\\d+");
    if (!actividad) continue;
    const fecha = m[1].match(/\((\d{2}\/\d{2}\/\d{4} \d{1,2}:\d{2})/)?.[1];
    cronograma.push({ actividad, fecha: fechaPortal(fecha) });
  }
  const recepcion = cronograma.find((c) =>
    /presentaci[oó]n de (la )?oferta|recepci[oó]n de (las )?oferta|presentaci[oó]n de propuesta/i.test(c.actividad),
  );
  const apertura = cronograma.find((c) => /apertura/i.test(c.actividad));

  // Documentos: nombre, tipo y documentFileId, en el orden del portal.
  const documentos: DgcpDocumento[] = [];
  for (const m of html.matchAll(/<tr id="grdGridDocumentList_tr\d+"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const nombre = porId(m[1], "spnDocumentName_\\d+");
    const id = m[1].match(/documentFileId='\s*\+\s*'(\d+)'/)?.[1];
    if (!nombre || !id) continue;
    documentos.push({
      nombre_documento: nombre,
      tipo_documento: porId(m[1], "spnDocumentTypeSpan_\\d+") ?? "",
      fecha_carga_archivo: null,
      url_documento: urlDocumento(id),
    });
  }

  // Artículos: cada línea BILN trae código, UNSPSC, descripción, cantidad, unidad y precio.
  const articulos: DgcpArticulo[] = [];
  const lineas = new Set([...html.matchAll(/DO1_BILN_(\d+)_Description"/g)].map((m) => m[1]));
  for (const n of lineas) {
    const campo = (c: string) => porId(html, `DO1_BILN_${n}_${c}`);
    const num = (c: string) => {
      const v = campo(c)?.replace(/,/g, "");
      return v && Number.isFinite(Number(v)) ? Number(v) : null;
    };
    articulos.push({
      descripcion_articulo: campo("CategoryCode_LookupText_fullMessage")?.replace(/^\d+\s*-\s*/, "") ?? "",
      descripcion_usuario: campo("Description"),
      cantidad: num("Quantity") ?? 0,
      unidad_medida: campo("Unit"),
      precio_unitario_estimado: num("CeilingPrice"),
      precio_total_estimado: num("CeilingPriceTotal"),
      subclase_unspsc: campo("CategoryCode_LookupText_fullMessage")?.match(/^\d+/)?.[0] ?? null,
    });
  }

  const precio = montoPortal(porId(html, "cbxBasePriceValue"));
  const proceso = avisoAProceso(aviso, {
    titulo: porId(html, "spnRequestName") || aviso.titulo,
    descripcion: porId(html, "spnDescription"),
    modalidad: porId(html, "spnProcedureType") || modalidadPortal(aviso.codigo, null),
    monto_estimado: precio.monto ?? aviso.monto,
    divisa: precio.divisa ?? aviso.divisa,
    fecha_fin_recepcion_ofertas: aviso.cierre ?? recepcion?.fecha ?? null,
    fecha_apertura_ofertas: apertura?.fecha ?? null,
  });
  return { proceso, articulos, documentos, cronograma };
}

// ─── Red ────────────────────────────────────────────────────────────────────

async function pedir(ruta: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<Response> {
  const res = await fetch(`${PORTAL}${ruta}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`El portal de ComprasDominicana respondió ${res.status} en ${ruta.split("?")[0]}`);
  return res;
}

async function abrirSesion(): Promise<{ cookie: string; html: string }> {
  const res = await pedir("/Public/Tendering/ContractNoticeManagement/Index");
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { cookie, html: await res.text() };
}

const mkey = (html: string, accion: string) =>
  html.match(new RegExp(`${accion}[\\s\\S]*?mkey=([\\w]+)`))?.[1] ?? null;

// Busca por código, completo o no. Devuelve todos los avisos que coinciden.
export async function buscarPorCodigo(referencia: string): Promise<AvisoPortal[]> {
  const { cookie, html } = await abrirSesion();
  const mk = mkey(html, "AdvancedSearchAjax");
  if (!mk) throw new Error("El portal cambió: no encontré la búsqueda avanzada.");
  const q = new URLSearchParams({
    perspective: "All",
    initAction: "Index",
    pageNumber: "0",
    startIndex: "1",
    endIndex: "100",
    currentPagingStyle: "0",
    displayAdvancedParams: "true",
    orderParam: "RequestOnlinePublishingDateDESC",
    searchExecuted: "False",
    reference: referencia.trim(),
    categorizationSystemCode: "UNSPSC",
    mkey: mk,
  });
  const res = await pedir(`/Public/Tendering/ContractNoticeManagement/AdvancedSearchAjax?${q}`, {
    headers: { cookie, "x-requested-with": "XMLHttpRequest" },
  });
  return parsearListado(await res.text());
}

// Lo publicado desde `desde` (ISO), del más nuevo al más viejo, página a
// página hasta pasar esa fecha. Si una página falla, devuelve lo que llevaba.
export async function publicadosDesde(
  desde: string,
  { maxPaginas = 6, presupuestoMs = 25_000 } = {},
): Promise<{ avisos: AvisoPortal[]; completo: boolean }> {
  const inicio = Date.now();
  const limite = new Date(desde).getTime();
  const { cookie, html } = await abrirSesion();
  const avisos = parsearListado(html);
  let ultimo = html;
  const pasado = () => {
    const t = avisos.at(-1)?.publicado;
    return t != null && new Date(t).getTime() < limite;
  };
  for (let pg = 1; pg < maxPaginas && !pasado(); pg++) {
    if (Date.now() - inicio > presupuestoMs) return { avisos: dentro(avisos, limite), completo: false };
    const mk = mkey(ultimo, "ResultListGoToPage");
    if (!mk) break;
    const body = new URLSearchParams({
      startIdx: String(pg * 100),
      endIdx: String(pg * 100 + 99),
      pageNumber: String(pg),
      perspective: "All",
      initAction: "Index",
      startIndex: "1",
      endIndex: "100",
      currentPagingStyle: "0",
      orderParam: "RequestOnlinePublishingDateDESC",
      searchExecuted: "False",
      categorizationSystemCode: "UNSPSC",
    });
    try {
      const res = await pedir(`/Public/Tendering/ContractNoticeManagement/ResultListGoToPage?mkey=${mk}`, {
        method: "POST",
        body,
        headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      });
      const h = await res.text();
      const lote = parsearListado(h);
      if (!lote.length) break;
      avisos.push(...lote);
      ultimo = h;
    } catch {
      return { avisos: dentro(avisos, limite), completo: false };
    }
  }
  return { avisos: dentro(avisos, limite), completo: pasado() };
}

function dentro(avisos: AvisoPortal[], limite: number) {
  return avisos.filter((a) => a.publicado != null && new Date(a.publicado).getTime() >= limite);
}

export async function detalle(aviso: AvisoPortal): Promise<DetallePortal> {
  const res = await pedir(
    `/Public/Tendering/OpportunityDetail/Index?noticeUID=${encodeURIComponent(aviso.noticeUID)}&isModal=true&asPopupView=true`,
  );
  return parsearDetalle(await res.text(), aviso);
}
