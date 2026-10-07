// Una sola puerta para los procesos de la DGCP: la API de datos abiertos
// (completa pero con ~1 día de atraso) y el portal público (al minuto). El
// MCP pide por aquí y no tiene que saber de dónde sale cada cosa.

import * as api from "./api";
import * as portal from "./portal";
import { normalizar } from "./relevancia";

export type Fuente = "api" | "portal";

export interface ProcesoResuelto {
  codigo: string;
  proceso: api.DgcpProceso;
  fuente: Fuente;
  aviso: portal.AvisoPortal | null;
}

const igual = (a: string, b: string) => normalizar(a).trim() === normalizar(b).trim();

// El código tal como lo escribió la persona: completo, sin el prefijo de la
// entidad ("HACIENDA-DAF-CM-2026-0098" por "MINISTERIO HACIENDA-DAF-CM-2026-0098")
// o en minúsculas. Primero la API con el código exacto; si no, el portal busca
// por coincidencia parcial y, con el código real, se vuelve a la API.
export async function resolverProceso(entrada: string): Promise<ProcesoResuelto | null> {
  const codigo = entrada.trim();
  const exacto = await api.obtenerProceso(codigo).catch(() => null);
  if (exacto) return { codigo: exacto.codigo_proceso, proceso: exacto, fuente: "api", aviso: null };

  const candidatos = await portal.buscarPorCodigo(codigo);
  const aviso =
    candidatos.find((a) => igual(a.codigo, codigo)) ??
    candidatos.find((a) => normalizar(a.codigo).endsWith(normalizar(codigo))) ??
    (candidatos.length === 1 ? candidatos[0] : null);
  if (!aviso) {
    if (candidatos.length > 1) {
      throw new Error(
        `«${codigo}» coincide con varios procesos: ${candidatos.slice(0, 8).map((a) => a.codigo).join(", ")}. Usa el código completo.`,
      );
    }
    return null;
  }
  const enApi = igual(aviso.codigo, codigo) ? null : await api.obtenerProceso(aviso.codigo).catch(() => null);
  if (enApi) return { codigo: enApi.codigo_proceso, proceso: enApi, fuente: "api", aviso };
  return { codigo: aviso.codigo, proceso: portal.avisoAProceso(aviso), fuente: "portal", aviso };
}

export interface FichaProceso extends ProcesoResuelto {
  articulos: api.DgcpArticulo[];
  documentos: api.DgcpDocumento[];
  cronograma: { actividad: string; fecha: string | null }[] | null;
}

// Proceso + artículos + documentos. Si la API aún no lo tiene, o lo tiene
// sin documentos (los sube con el mismo atraso), sale del detalle del portal.
export async function fichaProceso(entrada: string): Promise<FichaProceso | null> {
  const r = await resolverProceso(entrada);
  if (!r) return null;
  if (r.fuente === "api") {
    const [articulos, documentos] = await Promise.all([
      api.listarArticulos(r.codigo),
      api.listarDocumentos(r.codigo),
    ]);
    if (documentos.length) return { ...r, articulos, documentos, cronograma: null };
  }
  const aviso = r.aviso ?? (await portal.buscarPorCodigo(r.codigo)).find((a) => igual(a.codigo, r.codigo));
  if (!aviso) {
    return { ...r, articulos: await api.listarArticulos(r.codigo), documentos: [], cronograma: null };
  }
  const d = await portal.detalle(aviso);
  return {
    ...r,
    // Lo de la API (más completo: mipyme, objeto…) manda si existe.
    proceso: r.fuente === "api" ? r.proceso : d.proceso,
    fuente: r.fuente === "api" ? "api" : "portal",
    aviso,
    articulos: d.articulos,
    documentos: d.documentos,
    cronograma: d.cronograma,
  };
}

// Todos los procesos abiertos: los de la API más lo que el portal publicó
// después del último que la API conoce (con 2 h de solape por si acaso).
export async function procesosAbiertos(): Promise<{
  procesos: api.DgcpProceso[];
  paginasFallidas: number;
  delPortal: number;
  portalCompleto: boolean;
  avisoPortal: string | null;
}> {
  const { procesos, paginasFallidas } = await api.listarProcesos();
  const ultimo = procesos.reduce<string | null>(
    (max, p) => (p.fecha_publicacion && (!max || p.fecha_publicacion > max) ? p.fecha_publicacion : max),
    null,
  );
  const desde = new Date((ultimo ? new Date(ultimo).getTime() : Date.now() - 2 * 86_400_000) - 2 * 3_600_000);
  try {
    const { avisos, completo } = await portal.publicadosDesde(desde.toISOString());
    const conocidos = new Set(procesos.map((p) => p.codigo_proceso));
    const nuevos = avisos.filter((a) => portal.abierto(a) && !conocidos.has(a.codigo) && conocidos.add(a.codigo));
    return {
      procesos: [...procesos, ...nuevos.map((a) => portal.avisoAProceso(a))],
      paginasFallidas,
      delPortal: nuevos.length,
      portalCompleto: completo,
      avisoPortal: completo ? null : "El portal no respondió entero: puede faltar algo de lo publicado hoy.",
    };
  } catch (e) {
    return {
      procesos,
      paginasFallidas,
      delPortal: 0,
      portalCompleto: false,
      avisoPortal: `No pude leer el portal (${e instanceof Error ? e.message : e}): falta lo publicado desde ${ultimo ?? "ayer"}.`,
    };
  }
}
