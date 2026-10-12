// Caché del expediente completo de un proceso (ver supabase_expedientes.sql):
// la fila de lic_expediente con el índice de archivos y el análisis, y los
// archivos y su texto en el bucket privado `expedientes`. Es información
// pública de la DGCP: la caché es común a todas las organizaciones y solo la
// toca el servidor (service_role).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalisisExpediente } from "./analisis";

export const BUCKET = "expedientes";

/** Un archivo del ZIP del portal. */
export interface ArchivoExpediente {
  ruta: string;
  bytes: number;
  sha1: string;
  /** El binario está en storage ({codigo}/{sha1}.bin). Los muy grandes solo se listan. */
  guardado: boolean;
  /**
   * listo: hay texto ({codigo}/{sha1}.json) · escaneado: falta OCR · ilegible: no es texto ·
   * grande: no se guardó al bajar (se trae del portal al pedirlo) · sin_procesar: guardado, el texto se extrae al pedirlo
   */
  texto: "listo" | "escaneado" | "ilegible" | "grande" | "sin_procesar";
  paginas?: number;
  ocr?: boolean;
  /** El OCR se intentó y no salió (negativa del modelo, error): no reintentar en bucle. */
  ocr_fallido?: string;
  /** OCR a medias (un sobre de 80 páginas no cabe en una pasada): página por la que sigue. */
  ocr_siguiente?: number;
}

export type EstadoExpediente = "pendiente" | "procesando" | "listo" | "error";
export type FaseExpediente = "descargar" | "ocr" | "analizar" | "listo";

export interface FilaExpediente {
  codigo: string;
  estado: EstadoExpediente;
  fase: FaseExpediente;
  estado_dgcp: string | null;
  archivos: ArchivoExpediente[];
  analisis: AnalisisExpediente | null;
  error: string | null;
  intentos: number;
  trabajando_hasta: string | null;
  descargado_at: string | null;
  listo_at: string | null;
  updated_at: string;
}

export async function leerFila(sb: SupabaseClient, codigo: string): Promise<FilaExpediente | null> {
  const { data, error } = await sb.from("lic_expediente").select("*").eq("codigo", codigo).maybeSingle();
  if (error) throw new Error(`No se pudo leer el expediente ${codigo}: ${error.message}`);
  return data as FilaExpediente | null;
}

export async function guardarFila(sb: SupabaseClient, codigo: string, cambios: Partial<FilaExpediente>) {
  const { error } = await sb.from("lic_expediente").upsert({ codigo, ...cambios }, { onConflict: "codigo" });
  if (error) throw new Error(`No se pudo guardar el expediente ${codigo}: ${error.message}`);
}

/**
 * Reserva el expediente para procesarlo hasta `hasta`. false si otro
 * proceso lo tiene reservado (la reserva vence sola si ese proceso murió).
 */
export async function reservar(sb: SupabaseClient, codigo: string, hasta: Date): Promise<boolean> {
  await sb.from("lic_expediente").upsert({ codigo }, { onConflict: "codigo", ignoreDuplicates: true });
  const ahora = new Date().toISOString();
  const { data, error } = await sb
    .from("lic_expediente")
    .update({ trabajando_hasta: hasta.toISOString(), estado: "procesando" })
    .eq("codigo", codigo)
    .or(`trabajando_hasta.is.null,trabajando_hasta.lt.${ahora}`)
    .select("codigo");
  if (error) throw new Error(`No se pudo reservar el expediente ${codigo}: ${error.message}`);
  return (data ?? []).length > 0;
}

export async function liberar(sb: SupabaseClient, codigo: string) {
  await sb.from("lic_expediente").update({ trabajando_hasta: null }).eq("codigo", codigo);
}

// Las rutas del portal llevan espacios, tildes y comas: en storage se usa el sha1.
const ruta = (codigo: string, sha1: string, ext: "bin" | "json") =>
  `${codigo.replace(/[^\w.-]+/g, "_")}/${sha1}.${ext}`;

export async function subirBinario(sb: SupabaseClient, codigo: string, sha1: string, bytes: Uint8Array) {
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(ruta(codigo, sha1, "bin"), bytes, { upsert: true, contentType: "application/octet-stream" });
  if (error) throw new Error(`No se pudo guardar un archivo del expediente: ${error.message}`);
}

export async function bajarBinario(sb: SupabaseClient, codigo: string, sha1: string): Promise<Uint8Array> {
  const { data, error } = await sb.storage.from(BUCKET).download(ruta(codigo, sha1, "bin"));
  if (error || !data) throw new Error(`No se pudo leer un archivo del expediente: ${error?.message ?? "vacío"}`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function subirTexto(sb: SupabaseClient, codigo: string, sha1: string, paginas: string[]) {
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(ruta(codigo, sha1, "json"), JSON.stringify({ paginas }), { upsert: true, contentType: "application/json" });
  if (error) throw new Error(`No se pudo guardar el texto de un archivo: ${error.message}`);
}

export async function bajarTexto(sb: SupabaseClient, codigo: string, sha1: string): Promise<string[]> {
  const { data, error } = await sb.storage.from(BUCKET).download(ruta(codigo, sha1, "json"));
  if (error || !data) throw new Error(`No se pudo leer el texto de un archivo: ${error?.message ?? "vacío"}`);
  return (JSON.parse(await data.text()) as { paginas: string[] }).paginas;
}

/** Estados de la DGCP con los que el expediente ya no cambia. */
export function esFinal(estadoDgcp: string | null | undefined) {
  return /adjudicado|desierto|cancelado|celebrado/i.test(estadoDgcp ?? "");
}

/**
 * ¿Hay que volver a bajar el expediente? Un proceso cerrado no cambia; uno
 * en evaluación sí (salen informes, actas, mensajes): se refresca cada 12 h.
 */
export function hayQueRefrescar(fila: FilaExpediente | null, estadoDgcpActual: string | null, ahora = new Date()) {
  // Sin descarga completa (o falló la descarga): hay que bajarlo. Un error en
  // el OCR o el análisis NO obliga a bajarlo otra vez: se sigue desde esa fase.
  if (!fila || !fila.descargado_at) return true;
  if (esFinal(fila.estado_dgcp)) return false;
  if (estadoDgcpActual && estadoDgcpActual !== fila.estado_dgcp) return true;
  return ahora.getTime() - new Date(fila.descargado_at).getTime() > 12 * 3_600_000;
}
