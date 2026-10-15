// Las DOS fuentes de la DGCP, juntas: la API de datos abiertos (completa,
// estructurada, pero una copia con horas de retraso y caídas) y el portal
// (fresco al minuto, HTML, 100 avisos por página). Ninguna herramienta
// responde con una sola, y ninguna contesta «nada» sin decir hasta dónde miró.
//
//   listarAbiertos()      → API ∪ portal (el hueco desde lo último de la API)
//   localizarProceso(ref) → API; si no está (o no responde), el portal
//
// Lo que motivó esto, 15-10-2026: «¿qué licitaciones hay hoy?» → «nada», y
// MIMARENA-DAF-CM-2026-0125 (RD$1.9M en licencias) llevaba media hora
// publicado en el portal. Las compras por debajo del umbral cierran en horas:
// lo que no se ve el mismo día, se perdió.

import * as dgcp from "./api";
import * as portal from "./portal-busqueda";
import { horaRd } from "./relevancia";

export type Origen = "api" | "portal";

export interface Frescura {
  api: { ok: boolean; hasta: string | null; procesos: number; retraso_horas?: number; error?: string };
  portal: {
    ok: boolean;
    /** Desde qué momento se pidió al portal (el hueco que cubre). */
    desde: string | null;
    hasta: string | null;
    procesos: number;
    paginas: number;
    /** false = había más páginas de las leídas: puede faltar algo del hueco. */
    completo: boolean;
    error?: string;
  };
  /** Lo que el analista debe decir en voz alta. */
  avisos: string[];
  /** Procesos que solo el portal tenía (los recién publicados). */
  nuevos_del_portal: number;
}

const HORA_MS = 3_600_000;
const DIA_MS = 86_400_000;
// Sin API, cuántos días atrás se barre el portal: las compras menores y por
// debajo del umbral cierran en menos; lo más largo (LPN) suele estar ya en la
// API cuando vuelve.
const DIAS_SIN_API = 7;
const PAGINAS_CON_API = 12;
const PAGINAS_SIN_API = 40;

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

const maxFecha = (fechas: (string | null)[]) =>
  fechas.reduce<string | null>((max, f) => (f && (!max || new Date(f) > new Date(max)) ? f : max), null);

/** API primero; del portal solo lo que la API no tiene, publicado y sin cerrar. */
export function fusionar(
  api: dgcp.DgcpProceso[],
  avisos: portal.AvisoPortal[],
  ahora: Date,
): { procesos: dgcp.DgcpProceso[]; origen: Map<string, Origen>; nuevosPortal: number } {
  const porCodigo = new Map<string, dgcp.DgcpProceso>();
  const origen = new Map<string, Origen>();
  for (const p of api) {
    porCodigo.set(p.codigo_proceso, p);
    origen.set(p.codigo_proceso, "api");
  }
  let nuevosPortal = 0;
  for (const a of avisos) {
    if (porCodigo.has(a.codigo) || a.estado !== "Published") continue;
    if (a.cierre && new Date(a.cierre).getTime() < ahora.getTime()) continue;
    porCodigo.set(a.codigo, portal.avisoAProceso(a));
    origen.set(a.codigo, "portal");
    nuevosPortal++;
  }
  return { procesos: [...porCodigo.values()], origen, nuevosPortal };
}

export interface OpcionesListado {
  ahora?: Date;
  /** Tope de páginas del portal (100 avisos cada una). */
  maxPaginasPortal?: number;
  /** Solo la API (para comparar o si el portal está vetado). */
  sinPortal?: boolean;
}

/** Todos los procesos abiertos que se pueden ver AHORA, con su frescura. */
export async function listarAbiertos(
  op: OpcionesListado = {},
): Promise<{ procesos: dgcp.DgcpProceso[]; origen: Map<string, Origen>; frescura: Frescura }> {
  const ahora = op.ahora ?? new Date();
  const frescura: Frescura = {
    api: { ok: false, hasta: null, procesos: 0 },
    portal: { ok: false, desde: null, hasta: null, procesos: 0, paginas: 0, completo: false },
    avisos: [],
    nuevos_del_portal: 0,
  };

  let api: dgcp.DgcpProceso[] = [];
  try {
    const r = await dgcp.listarProcesos();
    api = r.procesos;
    frescura.api = { ok: true, hasta: r.hasta, procesos: api.length };
    if (r.paginasFallidas) frescura.avisos.push(`Datos abiertos: ${r.paginasFallidas} página(s) no se pudieron leer.`);
    if (r.hasta) {
      const retraso = Math.round(((ahora.getTime() - new Date(r.hasta).getTime()) / HORA_MS) * 10) / 10;
      frescura.api.retraso_horas = Math.max(0, retraso);
      if (retraso > 24) {
        frescura.avisos.push(`Datos abiertos de la DGCP lleva ${Math.round(retraso)} h sin actualizarse (último publicado: ${horaRd(r.hasta)}); lo nuevo sale del portal.`);
      }
    }
  } catch (e) {
    frescura.api.error = mensaje(e);
    frescura.avisos.push(`Datos abiertos de la DGCP no responde (${mensaje(e)}): se usa solo el portal.`);
  }

  // El hueco: desde lo último que tiene la API (con 1 h de margen, por si
  // publicaron algo en el mismo minuto) hasta ahora. Sin API, varios días.
  const desde =
    frescura.api.ok && frescura.api.hasta
      ? new Date(new Date(frescura.api.hasta).getTime() - HORA_MS)
      : new Date(ahora.getTime() - DIAS_SIN_API * DIA_MS);

  let avisos: portal.AvisoPortal[] = [];
  if (!op.sinPortal) {
    try {
      const s = await portal.abrirSesion();
      const r = await portal.buscarAvisos(
        s,
        { desde, hasta: ahora },
        op.maxPaginasPortal ?? (frescura.api.ok ? PAGINAS_CON_API : PAGINAS_SIN_API),
        // Basta llegar a una página con algo anterior al hueco.
        (pagina) => pagina.some((a) => a.publicado !== null && new Date(a.publicado) < desde),
      );
      avisos = r.avisos.filter((a) => !a.publicado || new Date(a.publicado) >= desde);
      frescura.portal = {
        ok: true,
        desde: desde.toISOString(),
        hasta: maxFecha(avisos.map((a) => a.publicado)),
        procesos: avisos.length,
        paginas: r.paginas,
        completo: !r.hayMas,
      };
      if (r.hayMas) {
        const masViejo = r.avisos[r.avisos.length - 1]?.publicado;
        frescura.avisos.push(
          `El portal tiene más avisos de los leídos (${r.paginas} páginas): puede faltar algo publicado entre ${horaRd(desde.toISOString())} y ${masViejo ? horaRd(masViejo) : "?"}.`,
        );
      }
    } catch (e) {
      frescura.portal.error = mensaje(e);
      frescura.portal.desde = desde.toISOString();
      frescura.avisos.push(
        `El portal de ComprasDominicana no respondió (${mensaje(e)}): puede faltar lo publicado después de ${frescura.api.hasta ? horaRd(frescura.api.hasta) : "la última copia de datos abiertos"}.`,
      );
    }
  }

  if (!frescura.api.ok && !frescura.portal.ok) {
    throw new Error(
      `Ni la API de datos abiertos ni el portal de ComprasDominicana responden ahora mismo. ` +
        `API: ${frescura.api.error}. Portal: ${frescura.portal.error ?? "no consultado"}. ` +
        `Reintenta en unos minutos; mientras, la bandeja guarda el último barrido.`,
    );
  }

  const f = fusionar(api, avisos, ahora);
  frescura.nuevos_del_portal = f.nuevosPortal;
  return { procesos: f.procesos, origen: f.origen, frescura };
}

// ===== Un proceso concreto =====

export interface ProcesoLocalizado {
  proceso: dgcp.DgcpProceso;
  articulos: dgcp.DgcpArticulo[];
  documentos: dgcp.DgcpDocumento[];
  origen: Origen;
  /** noticeUID del portal, si se llegó a él. */
  uid: string | null;
  /** Qué debe saber el analista (de dónde salió, qué faltó). */
  aviso: string | null;
}

/** Código, enlace del portal o noticeUID → qué es. */
export function interpretarReferencia(ref: string): { codigo?: string; uid?: string } {
  const uid = portal.uidDe(ref);
  if (uid) return { uid };
  return { codigo: ref.trim() };
}

// Los documentos del portal que la API no lista (enmiendas, circulares
// subidas después): se añaden por nombre, sin duplicar.
function unirDocumentos(api: dgcp.DgcpDocumento[], delPortal: dgcp.DgcpDocumento[]): dgcp.DgcpDocumento[] {
  const nombres = new Set(api.map((d) => d.nombre_documento.trim().toLowerCase()));
  return [...api, ...delPortal.filter((d) => !nombres.has(d.nombre_documento.trim().toLowerCase()))];
}

async function desdeApi(codigo: string): Promise<{ hallado: ProcesoLocalizado | null; error: string | null }> {
  const [p, a, d] = await Promise.allSettled([
    dgcp.obtenerProceso(codigo),
    dgcp.listarArticulos(codigo),
    dgcp.listarDocumentos(codigo),
  ]);
  if (p.status === "rejected") return { hallado: null, error: mensaje(p.reason) };
  if (!p.value) return { hallado: null, error: null };
  const fallos = [a, d].filter((x) => x.status === "rejected").map((x) => mensaje((x as PromiseRejectedResult).reason));
  return {
    hallado: {
      proceso: p.value,
      articulos: a.status === "fulfilled" ? a.value : [],
      documentos: d.status === "fulfilled" ? d.value : [],
      origen: "api",
      uid: null,
      aviso: fallos.length ? `Datos abiertos no devolvió parte de la ficha (${fallos.join("; ")}).` : null,
    },
    error: null,
  };
}

function desdePortal(ficha: portal.FichaPortal, aviso: portal.AvisoPortal | null, nota: string): ProcesoLocalizado {
  return {
    proceso: portal.fichaAProceso(ficha, aviso),
    articulos: portal.articulosDe(ficha),
    documentos: portal.documentosDe(ficha),
    origen: "portal",
    uid: ficha.uid,
    aviso: nota,
  };
}

/**
 * Un proceso por código, enlace del portal o noticeUID. La API manda; si no
 * lo tiene todavía (o no responde), el portal. Con la API, los documentos se
 * completan con los del portal (las enmiendas tardan en llegar a la API).
 */
export async function localizarProceso(ref: string): Promise<ProcesoLocalizado> {
  const { codigo, uid } = interpretarReferencia(ref);

  if (codigo) {
    const { hallado, error } = await desdeApi(codigo);
    if (hallado) {
      // Documentos del portal: lo más fresco. Si el portal falla, con lo de la API basta.
      try {
        const s = await portal.abrirSesion();
        const aviso = await portal.avisoPorCodigo(s, codigo);
        if (aviso?.uid) {
          const ficha = await portal.leerFicha(aviso.uid);
          const antes = hallado.documentos.length;
          hallado.documentos = unirDocumentos(hallado.documentos, portal.documentosDe(ficha));
          hallado.uid = aviso.uid;
          if (hallado.documentos.length > antes) {
            hallado.aviso = [hallado.aviso, `${hallado.documentos.length - antes} documento(s) solo están en el portal (enmiendas o circulares recientes).`]
              .filter(Boolean)
              .join(" ");
          }
        }
      } catch {
        // El portal es un extra aquí.
      }
      return hallado;
    }
    const s = await portal.abrirSesion();
    const aviso = await portal.avisoPorCodigo(s, codigo);
    if (!aviso) {
      throw new Error(
        `Ni datos abiertos ni el portal de ComprasDominicana tienen un proceso «${codigo}».` +
          (error ? ` (Datos abiertos no respondió: ${error}.)` : "") +
          ` Revisa el código o pásame el enlace del portal (noticeUID).`,
      );
    }
    if (!aviso.uid) throw new Error(`El portal lista «${codigo}» pero sin enlace a su ficha.`);
    const ficha = await portal.leerFicha(aviso.uid);
    return desdePortal(
      ficha,
      aviso,
      error
        ? `Datos abiertos no respondió (${error}); leído del portal.`
        : "Publicado hace poco: todavía no está en datos abiertos de la DGCP; leído del portal (artículos y documentos tal como los muestra la ficha).",
    );
  }

  // Un noticeUID: la ficha dice el código; si la API ya lo tiene, mejor.
  const ficha = await portal.leerFicha(uid!);
  const { hallado } = await desdeApi(ficha.codigo).catch(() => ({ hallado: null, error: null }));
  if (hallado) {
    hallado.uid = ficha.uid;
    hallado.documentos = unirDocumentos(hallado.documentos, portal.documentosDe(ficha));
    return hallado;
  }
  let aviso: portal.AvisoPortal | null = null;
  try {
    aviso = await portal.avisoPorCodigo(await portal.abrirSesion(), ficha.codigo);
  } catch {
    // La institución puede faltar; el resto está en la ficha.
  }
  return desdePortal(ficha, aviso, "Todavía no está en datos abiertos de la DGCP; leído del portal.");
}

/** Solo los documentos (para leer uno). */
export async function documentosDe(ref: string): Promise<{ documentos: dgcp.DgcpDocumento[]; origen: Origen }> {
  const l = await localizarProceso(ref);
  return { documentos: l.documentos, origen: l.origen };
}
