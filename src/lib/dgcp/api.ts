// Cliente de la API de datos abiertos de la DGCP (datosabiertos.dgcp.gob.do).
// Sin auth y sin imports de servidor de la app (las descargas del portal, por portal.ts).
//
// Lo que se aprendió probándola (oct-2026), para no volver a tropezar:
//   - El filtro por proceso es `?proceso=<código>`. `codigo_proceso=` y
//     `codigoProceso=` responden 400 en /documentos, y en /articulos se
//     IGNORAN en silencio (devuelven artículos de otro proceso).
//   - /procesos/<código>/documentos no existe (404 "Cannot GET").
//   - Las URL de los documentos (comunidad.comprasdominicana.gob.do/Public/
//     Archive/RetrieveFile) se descargan SIN login.
//   - El portal sirve el certificado sin la cadena intermedia: las descargas
//     van por portal.ts, que la completa (sin apagar la verificación).
//   - /ofertas y /contratos también filtran con `?proceso=`.

import { bytesPortal } from "./portal";

const BASE = "https://datosabiertos.dgcp.gob.do/api-dgcp/v1";

export interface DgcpProceso {
  codigo_proceso: string;
  unidad_compra: string;
  modalidad: string;
  titulo: string;
  descripcion: string | null;
  estado_proceso: string;
  divisa: string | null;
  monto_estimado: number | null;
  fecha_publicacion: string | null;
  fecha_fin_recepcion_ofertas: string | null;
  fecha_apertura_ofertas: string | null;
  fecha_estimada_adjudicacion: string | null;
  dirigido_mipymes: string | null;
  dirigido_mipymes_mujeres: string | null;
  proceso_lotificado: string | null;
  objeto_proceso: string | null;
  url: string | null;
}

export interface DgcpDocumento {
  nombre_documento: string;
  tipo_documento: string;
  fecha_carga_archivo: string | null;
  url_documento: string;
}

export interface DgcpArticulo {
  descripcion_articulo: string;
  descripcion_usuario: string | null;
  cantidad: number;
  unidad_medida: string | null;
  precio_unitario_estimado: number | null;
  precio_total_estimado: number | null;
  subclase_unspsc: string | null;
}

interface Respuesta<T> {
  code: number;
  hasError: boolean;
  payload: { content: T[] | null; message?: string };
}

// La API manda las fechas en hora de RD pero marcadas como UTC («Z»):
// el cierre de las 15:00 del portal llega como "…T15:00:00Z" (comprobado
// oct-2026 contra el portal y los pliegos de INTRANT, Hacienda y el
// Ayuntamiento de Santiago). Se corrige aquí, una sola vez: la «Z» pasa a
// "-04:00" (RD no tiene horario de verano).
export function fechasEnHoraRd<T>(fila: T): T {
  const r = { ...fila } as Record<string, unknown>;
  for (const [k, v] of Object.entries(r)) {
    if (k.startsWith("fecha") && typeof v === "string" && /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/.test(v)) {
      r[k] = v.replace(/Z$/, "-04:00");
    }
  }
  return r as T;
}

async function pedir<T>(ruta: string, timeoutMs = 25_000): Promise<T[]> {
  const res = await fetch(`${BASE}${ruta}`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`La API de la DGCP respondió ${res.status} en ${ruta}`);
  const j = (await res.json()) as Respuesta<T>;
  if (j.hasError) {
    throw new Error(`La API de la DGCP devolvió error en ${ruta}: ${j.payload?.message ?? "sin detalle"}`);
  }
  return (j.payload?.content ?? []).map(fechasEnHoraRd);
}

// TODOS los procesos abiertos («Proceso publicado»). La API filtra por
// `estado` y entrega hasta 1000 por página: hoy son ~750 en UNA llamada.
//
// Antes se leían las 7 páginas más recientes SIN filtro (700 procesos de
// cualquier estado ≈ 4 días de publicaciones) y se perdía lo publicado hace
// una semana que cierra hoy — p. ej. MITUR-DAF-CM-2026-0106, publicado el
// 30-sep y con cierre el 6-oct, vivía en la página 10.
export async function listarProcesos(
  maxPaginas = 5,
): Promise<{ procesos: DgcpProceso[]; paginasFallidas: number }> {
  const procesos: DgcpProceso[] = [];
  let paginasFallidas = 0;
  for (let page = 1; page <= maxPaginas; page++) {
    let lote: DgcpProceso[];
    try {
      lote = await pedir<DgcpProceso>(
        `/procesos?estado=${encodeURIComponent("Proceso publicado")}&limit=1000&page=${page}`,
        40_000,
      );
    } catch (e) {
      if (page === 1) throw new Error(`No se pudo leer la API de la DGCP: ${e instanceof Error ? e.message : e}`);
      paginasFallidas++;
      break;
    }
    procesos.push(...lote);
    if (lote.length < 1000) break;
  }
  const vistos = new Set<string>();
  return {
    procesos: procesos.filter((p) => !vistos.has(p.codigo_proceso) && vistos.add(p.codigo_proceso)),
    paginasFallidas,
  };
}

export async function obtenerProceso(codigo: string): Promise<DgcpProceso | null> {
  const r = await pedir<DgcpProceso>(`/procesos?proceso=${encodeURIComponent(codigo)}`);
  return r.find((p) => p.codigo_proceso === codigo) ?? null;
}

export async function listarDocumentos(codigo: string): Promise<DgcpDocumento[]> {
  return pedir<DgcpDocumento>(`/procesos/documentos?proceso=${encodeURIComponent(codigo)}`);
}

export async function listarArticulos(codigo: string): Promise<DgcpArticulo[]> {
  const r = await pedir<DgcpArticulo & { codigo_proceso: string }>(
    `/procesos/articulos?proceso=${encodeURIComponent(codigo)}&limit=500`,
  );
  // Defensa: si la API vuelve a ignorar el filtro, no mezclar otro proceso.
  return r.filter((a) => a.codigo_proceso === codigo);
}

const MAX_DESCARGA_MB = 40;

// Va por portal.ts: el portal sirve su certificado sin la cadena intermedia y
// fetch de Node lo rechaza (UNABLE_TO_VERIFY_LEAF_SIGNATURE).
export async function descargarDocumento(url: string): Promise<{ bytes: Uint8Array; tipo: string }> {
  const { bytes, tipo } = await bytesPortal(url, MAX_DESCARGA_MB * 1024 * 1024);
  return { bytes, tipo: tipo || "application/octet-stream" };
}

// ===== Resultado de un proceso ya abierto =====

export interface DgcpOferta {
  id_oferta: string;
  codigo_proceso: string;
  rpe: string | null;
  razon_social: string;
  nombre_oferta: string | null;
  valor_oferta: number | null;
  estado_oferta: string | null;
  estado_evaluacion: string | null;
  tipo_oferta: string | null;
  fecha_entrega_oferta: string | null;
}

export interface DgcpContrato {
  codigo_contrato: string;
  codigo_proceso: string;
  estado_contrato: string | null;
  estado_adjudicacion: string | null;
  fecha_adjudicacion: string | null;
  divisa: string | null;
  valor_contratado: number | null;
  rpe: string | null;
  razon_social: string;
  url_contrato: string | null;
}

// Las ofertas recibidas (quién, cuánto, cuándo). OJO: `estado_evaluacion`
// suele quedarse en «Pendiente» aunque el proceso esté adjudicado; el
// resultado real está en el acta de adjudicación del expediente.
export async function listarOfertas(codigo: string): Promise<DgcpOferta[]> {
  const r = await pedir<DgcpOferta>(`/ofertas?proceso=${encodeURIComponent(codigo)}&limit=500`);
  return r.filter((o) => o.codigo_proceso === codigo);
}

// Un contrato/orden por adjudicatario (y por lote, si se adjudicó por lotes).
export async function listarContratos(codigo: string): Promise<DgcpContrato[]> {
  const r = await pedir<DgcpContrato>(`/contratos?proceso=${encodeURIComponent(codigo)}&limit=500`);
  return r.filter((c) => c.codigo_proceso === codigo);
}
