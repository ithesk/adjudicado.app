// Preparación del expediente en segundo plano, por fases que se reanudan:
//
//   descargar → recorre el ZIP del portal (streaming), sube cada archivo y su
//               texto a storage y deja el índice en lic_expediente
//   ocr       → transcribe con Claude los escaneados que deciden el
//               resultado (actas, informes, mensajes), tramo a tramo
//   analizar  → del texto a datos (analisis.ts): quién ganó qué, habilitados,
//               subsanaciones, precios por ítem, requisitos del pliego
//   listo
//
// Cada llamada trabaja hasta `hasta` y deja todo guardado; la ruta
// /api/expedientes/preparar se vuelve a llamar sola hasta terminar. La
// descarga no se puede reanudar a medias (el portal no acepta Range): un
// expediente que no se alcanza a bajar en una pasada queda en error.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as dgcp from "@/lib/dgcp/api";
import { esDocumentoClave, partesRuta, recorrerExpediente } from "@/lib/dgcp/expediente";
import { extraerTexto } from "@/lib/dgcp/texto";
import { analizarExpediente } from "./analisis";
import {
  bajarBinario,
  bajarTexto,
  guardarFila,
  hayQueRefrescar,
  leerFila,
  subirBinario,
  subirTexto,
  type ArchivoExpediente,
  type FilaExpediente,
} from "./almacen";
import { proveedor } from "./llm";
import { transcribir } from "./ocr";

/** Más que esto no se guarda nunca (tope de un objeto en Supabase Storage: 50 MB). */
export const MAX_BINARIO = 45 * 1024 * 1024;
/**
 * Al bajar el expediente se guardan los documentos clave y lo que pese hasta
 * esto; lo más grande (estatutos, registros mercantiles escaneados…) solo se
 * lista y se baja del portal si alguien lo pide. Subir los 170 MB de un
 * proceso grande no cabía en el tiempo de una función.
 */
export const MAX_AL_BAJAR = 8 * 1024 * 1024;

export function guardarAlBajar(ruta: string, bytes: number) {
  return bytes <= MAX_BINARIO && (bytes <= MAX_AL_BAJAR || esDocumentoClave(ruta) || esPliego(ruta));
}

const sha1 = (b: Uint8Array) => createHash("sha1").update(b).digest("hex");

// Lo que se lee primero: lo que dice cómo terminó el proceso.
export function prioridad(ruta: string): number {
  const { carpeta } = partesRuta(ruta);
  if (carpeta.startsWith("6_")) return 0;
  if (carpeta.startsWith("5_")) return 1;
  if (carpeta.startsWith("4_")) return 2;
  if (carpeta.startsWith("8_")) return 3;
  if (carpeta.startsWith("3_")) return 4;
  if (carpeta.startsWith("2_")) return 5;
  if (esPliego(ruta)) return 6;
  return 9;
}

/** Pliego, ficha o términos de referencia: de ahí salen los requisitos. */
export function esPliego(ruta: string) {
  const { carpeta, archivo } = partesRuta(ruta);
  return carpeta.startsWith("1_") && /pliego|ficha|especificac|t[eé]rminos|requerimiento|tdr/i.test(archivo);
}

/** Lo que vale la pena extraer durante la descarga: el resto, al pedirlo (la CPU no da para todo). */
export function extraerAlBajar(ruta: string, bytes: number) {
  return esDocumentoClave(ruta) || esPliego(ruta) || bytes <= 1_500_000;
}

/** Extrae el texto de un archivo guardado sin procesar (y lo deja guardado). Modifica `a`. */
export async function asegurarTexto(sb: SupabaseClient, codigo: string, a: ArchivoExpediente) {
  if (a.texto !== "sin_procesar") return;
  const { estado, paginas } = await textoDe(a.ruta, await bajarBinario(sb, codigo, a.sha1));
  if (estado === "listo") await subirTexto(sb, codigo, a.sha1, paginas);
  a.texto = estado;
  a.paginas = paginas.length || undefined;
}

async function textoDe(ruta: string, bytes: Uint8Array): Promise<{ estado: ArchivoExpediente["texto"]; paginas: string[] }> {
  try {
    const t = await extraerTexto(ruta, bytes);
    if (t.formato === "otro") return { estado: "ilegible", paginas: [] };
    if (t.escaneado) return { estado: "escaneado", paginas: t.paginas };
    return { estado: "listo", paginas: t.paginas };
  } catch {
    return { estado: "ilegible", paginas: [] };
  }
}

async function descargar(sb: SupabaseClient, fila: FilaExpediente | null, proceso: dgcp.DgcpProceso, hasta: number) {
  const codigo = proceso.codigo_proceso;
  // Lo ya procesado de una descarga anterior se reutiliza por sha1 (el OCR cuesta).
  const previos = new Map((fila?.archivos ?? []).map((a) => [a.sha1, a]));
  const inicio = Date.now();
  const archivos: ArchivoExpediente[] = [];
  // Subir y extraer el texto en paralelo con la descarga (hasta 6 a la vez):
  // un expediente de 170 MB tarda ~3 min en bajar desde el portal y no
  // queda tiempo para hacerlo en serie.
  const enCurso = new Set<Promise<void>>();
  let fallo: unknown = null;
  let n = 0;
  const procesar = async (ruta: string, contenido: Uint8Array) => {
    const huella = sha1(contenido);
    const previo = previos.get(huella);
    if (previo?.guardado) {
      archivos.push({ ...previo, ruta });
      return;
    }
    await subirBinario(sb, codigo, huella, contenido);
    if (!extraerAlBajar(ruta, contenido.length)) {
      archivos.push({ ruta, bytes: contenido.length, sha1: huella, guardado: true, texto: "sin_procesar" });
      return;
    }
    const { estado, paginas } = await textoDe(ruta, contenido);
    if (estado === "listo") await subirTexto(sb, codigo, huella, paginas);
    archivos.push({ ruta, bytes: contenido.length, sha1: huella, guardado: true, texto: estado, paginas: paginas.length || undefined });
  };
  const r = await recorrerExpediente(proceso.url!, {
    guardar: guardarAlBajar,
    limite: hasta,
    alGuardar: async (ruta, contenido) => {
      if (fallo) throw fallo;
      const tarea = procesar(ruta, contenido).catch((e) => {
        fallo = e;
      });
      enCurso.add(tarea);
      void tarea.finally(() => enCurso.delete(tarea));
      if (++n % 25 === 0) console.info(`[expediente] ${codigo}: ${n} guardados, ${((Date.now() - inicio) / 1000).toFixed(0)} s`);
      if (enCurso.size >= 6) await Promise.race(enCurso);
    },
  });
  await Promise.all(enCurso);
  console.info(
    `[expediente] ${codigo}: ${r.entradas.length} archivos, ${(r.entradas.reduce((n, e) => n + e.bytes, 0) / 1048576).toFixed(0)} MB, ` +
      `completo=${r.completo}${r.motivoCorte ? ` (${r.motivoCorte})` : ""}, ${((Date.now() - inicio) / 1000).toFixed(0)} s`,
  );
  if (fallo) throw fallo;
  if (!r.completo) {
    throw new Error(
      r.motivoCorte === "tiempo"
        ? "El expediente es demasiado grande para bajarlo en una pasada (el portal no permite reanudar)."
        : `La descarga se cortó (${r.motivoCorte}).`,
    );
  }
  // Los que no se guardaron (grandes) también se listan: se bajan del portal al pedirlos.
  const guardados = new Set(archivos.map((a) => a.ruta));
  for (const e of r.entradas) {
    if (!guardados.has(e.ruta)) archivos.push({ ruta: e.ruta, bytes: e.bytes, sha1: "", guardado: false, texto: "grande" });
  }
  return archivos;
}

/** OCR de los escaneados que importan para el resultado. false si quedó trabajo. */
async function ocrClave(sb: SupabaseClient, codigo: string, archivos: ArchivoExpediente[], hasta: number) {
  // Sin modelo no se marca nada como fallido: se transcribirá cuando lo haya.
  if (!proveedor()) return true;
  const pendientes = archivos
    .filter((a) => a.texto === "escaneado" && a.guardado && !a.ocr_fallido && (esDocumentoClave(a.ruta) || esPliego(a.ruta)))
    .sort((a, b) => prioridad(a.ruta) - prioridad(b.ruta));
  for (const a of pendientes) {
    if (Date.now() > hasta - 60_000) return false;
    const r = await ocrArchivo(sb, codigo, a, hasta);
    if (!r.completo && !a.ocr_fallido) return false;
  }
  return true;
}

/** Transcribe (o sigue transcribiendo) un archivo; actualiza `a` en sitio. */
export async function ocrArchivo(sb: SupabaseClient, codigo: string, a: ArchivoExpediente, hasta: number) {
  try {
    const bytes = await bajarBinario(sb, codigo, a.sha1);
    const desde = a.ocr_siguiente ?? 1;
    const previas = desde > 1 ? await bajarTexto(sb, codigo, a.sha1).catch(() => []) : [];
    const r = await transcribir(bytes, hasta, desde);
    const paginas = [...previas, ...r.paginas];
    if (paginas.length) await subirTexto(sb, codigo, a.sha1, paginas);
    a.ocr = true;
    a.paginas = paginas.length;
    if (r.completo) {
      a.texto = "listo";
      delete a.ocr_siguiente;
    } else a.ocr_siguiente = r.siguiente;
    return { completo: r.completo, paginas };
  } catch (e) {
    a.ocr_fallido = e instanceof Error ? e.message : String(e);
    return { completo: false, paginas: [] as string[] };
  }
}

// Tope de texto que se manda a analizar (~45k tokens).
const TOPE_DOC = 25_000;
const TOPE_TOTAL = 180_000;

async function analizar(sb: SupabaseClient, codigo: string, archivos: ArchivoExpediente[]) {
  const candidatos = archivos
    .filter((a) => a.texto === "listo" && (esDocumentoClave(a.ruta) || esPliego(a.ruta)))
    .sort((a, b) => prioridad(a.ruta) - prioridad(b.ruta));
  const vistos = new Set<string>();
  const documentos: { ruta: string; texto: string }[] = [];
  let usados = 0;
  for (const a of candidatos) {
    if (vistos.has(a.sha1) || usados >= TOPE_TOTAL) continue;
    vistos.add(a.sha1);
    const texto = (await bajarTexto(sb, codigo, a.sha1))
      .map((p, i) => `--- página ${i + 1} ---\n${p}`)
      .join("\n")
      .replace(/[ \t]{2,}/g, " ")
      .slice(0, Math.min(TOPE_DOC, TOPE_TOTAL - usados));
    usados += texto.length;
    documentos.push({ ruta: a.ruta, texto });
  }
  if (!documentos.length) return null;
  return analizarExpediente(codigo, documentos);
}

/**
 * Avanza la preparación hasta `hasta` (ms). Devuelve la fase en que quedó;
 * `terminado` cuando el expediente está listo (o en error definitivo).
 */
export async function prepararExpediente(sb: SupabaseClient, codigo: string, hasta: number) {
  const proceso = await dgcp.obtenerProceso(codigo);
  if (!proceso?.url) throw new Error(`La DGCP no tiene la página pública de ${codigo}.`);
  let fila = await leerFila(sb, codigo);

  try {
    if (!fila || fila.fase === "descargar" || hayQueRefrescar(fila, proceso.estado_proceso)) {
      const archivos = await descargar(sb, fila, proceso, hasta - 30_000);
      await guardarFila(sb, codigo, {
        archivos,
        estado_dgcp: proceso.estado_proceso,
        descargado_at: new Date().toISOString(),
        fase: "ocr",
        estado: "procesando",
        error: null,
      });
      fila = (await leerFila(sb, codigo))!;
    }

    if (fila.fase === "ocr") {
      const archivos = fila.archivos;
      const listo = await ocrClave(sb, codigo, archivos, hasta);
      await guardarFila(sb, codigo, { archivos, fase: listo ? "analizar" : "ocr" });
      if (!listo) return { fase: "ocr" as const, terminado: false };
      fila = { ...fila, archivos, fase: "analizar" };
    }

    if (fila.fase === "analizar") {
      if (Date.now() > hasta - 90_000) return { fase: "analizar" as const, terminado: false };
      const analisis = proveedor() ? await analizar(sb, codigo, fila.archivos) : null;
      await guardarFila(sb, codigo, {
        analisis,
        fase: "listo",
        estado: "listo",
        intentos: 0,
        listo_at: new Date().toISOString(),
        error: proveedor() ? null : "Sin ANTHROPIC_API_KEY ni OPENAI_API_KEY: expediente sin OCR ni análisis.",
      });
    }
    return { fase: "listo" as const, terminado: true };
  } catch (e) {
    const intentos = (fila?.intentos ?? 0) + 1;
    await guardarFila(sb, codigo, {
      estado: "error",
      error: e instanceof Error ? e.message : String(e),
      intentos,
      // Tras un error en la descarga se vuelve a empezar por ahí.
      fase: fila?.descargado_at ? fila.fase : "descargar",
    });
    return { fase: "error" as const, terminado: intentos >= 3 };
  }
}
