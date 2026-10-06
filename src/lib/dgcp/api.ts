// Cliente de la API de datos abiertos de la DGCP (datosabiertos.dgcp.gob.do).
// Sin auth y sin imports de servidor de la app: solo fetch.
//
// Lo que se aprendió probándola (oct-2026), para no volver a tropezar:
//   - El filtro por proceso es `?proceso=<código>`. `codigo_proceso=` y
//     `codigoProceso=` responden 400 en /documentos, y en /articulos se
//     IGNORAN en silencio (devuelven artículos de otro proceso).
//   - /procesos/<código>/documentos no existe (404 "Cannot GET").
//   - Las URL de los documentos (comunidad.comprasdominicana.gob.do/Public/
//     Archive/RetrieveFile) se descargan SIN login.
//   - El certificado del portal falla a veces la verificación; Node lo
//     acepta hoy, pero si un día no, el error sale con el host para saberlo.

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
  return j.payload?.content ?? [];
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

export async function descargarDocumento(url: string): Promise<{ bytes: Uint8Array; tipo: string }> {
  const host = new URL(url).hostname;
  if (!host.endsWith("comprasdominicana.gob.do") && !host.endsWith("dgcp.gob.do")) {
    throw new Error(`Solo se descargan documentos del portal de la DGCP (no de ${host}).`);
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(45_000), cache: "no-store" });
  if (!res.ok) throw new Error(`El portal respondió ${res.status} al descargar el documento.`);
  const largo = Number(res.headers.get("content-length") ?? 0);
  if (largo > MAX_DESCARGA_MB * 1024 * 1024) {
    throw new Error(`El documento pesa ${(largo / 1048576).toFixed(0)} MB; el tope es ${MAX_DESCARGA_MB} MB.`);
  }
  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    tipo: res.headers.get("content-type") ?? "application/octet-stream",
  };
}
