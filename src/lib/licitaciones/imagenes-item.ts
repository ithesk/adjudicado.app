// La imagen del producto de cada ítem (la piden algunas entidades en la
// oferta técnica). SOLO SERVIDOR.
//
// Sin columna nueva: vive en el almacenamiento con ruta FIJA por ítem —
// <org>/licitaciones/<proceso>/items/<item_id>.<ext> — y se descubre
// listando esa carpeta (una llamada por proceso). Reemplazar = borrar la
// anterior (puede tener otra extensión) y subir la nueva.

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatoRealDeImagen } from "./generador";

const BUCKET = "documentos";
export const MAX_IMAGEN_MB = 4; // las server actions de Vercel cortan en 4,5 MB
const PERMITIDOS = ["png", "jpeg", "webp"] as const;

export function carpetaImagenes(orgId: string, procesoId: string): string {
  return `${orgId}/licitaciones/${procesoId}/items`;
}

export interface ImagenItem {
  ruta: string;
  actualizada: string | null;
}

// item_id → su imagen (si tiene).
export async function listarImagenesItems(
  supabase: SupabaseClient,
  orgId: string,
  procesoId: string,
): Promise<Map<string, ImagenItem>> {
  const carpeta = carpetaImagenes(orgId, procesoId);
  const { data } = await supabase.storage.from(BUCKET).list(carpeta, { limit: 500 });
  const mapa = new Map<string, ImagenItem>();
  for (const f of data ?? []) {
    const m = f.name.match(/^([0-9a-f-]{36})\.(png|jpeg|webp)$/);
    if (m) mapa.set(m[1], { ruta: `${carpeta}/${f.name}`, actualizada: f.updated_at ?? null });
  }
  return mapa;
}

// item_id → URL firmada (1 h) para las miniaturas de la Bid Room.
export async function urlsImagenesItems(
  supabase: SupabaseClient,
  orgId: string,
  procesoId: string,
): Promise<Record<string, string>> {
  const mapa = await listarImagenesItems(supabase, orgId, procesoId);
  if (mapa.size === 0) return {};
  const ids = [...mapa.keys()];
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(ids.map((id) => mapa.get(id)!.ruta), 3600);
  const urls: Record<string, string> = {};
  (data ?? []).forEach((d, i) => {
    if (d.signedUrl) urls[ids[i]] = d.signedUrl;
  });
  return urls;
}

// Valida por los BYTES (la extensión y el content-type mienten) y guarda.
export async function guardarImagenItem(
  supabase: SupabaseClient,
  orgId: string,
  procesoId: string,
  itemId: string,
  bytes: Buffer,
): Promise<string | null> {
  if (bytes.length > MAX_IMAGEN_MB * 1024 * 1024) return `La imagen pesa más de ${MAX_IMAGEN_MB} MB.`;
  const formato = formatoRealDeImagen(bytes);
  if (!formato || !(PERMITIDOS as readonly string[]).includes(formato)) {
    return "La imagen debe ser PNG, JPG o WebP.";
  }
  const error = await quitarImagenItem(supabase, orgId, procesoId, itemId);
  if (error) return error;
  const { error: errSubida } = await supabase.storage
    .from(BUCKET)
    .upload(`${carpetaImagenes(orgId, procesoId)}/${itemId}.${formato}`, bytes, {
      contentType: `image/${formato}`,
      upsert: true,
    });
  return errSubida ? `No se pudo subir la imagen: ${errSubida.message}` : null;
}

export async function quitarImagenItem(
  supabase: SupabaseClient,
  orgId: string,
  procesoId: string,
  itemId: string,
): Promise<string | null> {
  const carpeta = carpetaImagenes(orgId, procesoId);
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove(PERMITIDOS.map((ext) => `${carpeta}/${itemId}.${ext}`));
  return error ? `No se pudo quitar la imagen: ${error.message}` : null;
}

// Las imágenes de los ítems para la oferta técnica, por NÚMERO de ítem.
export async function descargarImagenesItems(
  supabase: SupabaseClient,
  orgId: string,
  procesoId: string,
  items: { id: string; numero: number }[],
): Promise<{ porNumero: Map<number, Buffer>; huella: string[] }> {
  const mapa = await listarImagenesItems(supabase, orgId, procesoId);
  const porNumero = new Map<number, Buffer>();
  const huella: string[] = [];
  await Promise.all(
    items.map(async (it) => {
      const img = mapa.get(it.id);
      if (!img) return;
      const { data } = await supabase.storage.from(BUCKET).download(img.ruta);
      if (!data) return;
      porNumero.set(it.numero, Buffer.from(await data.arrayBuffer()));
      huella.push(`${it.numero}:${img.ruta}:${img.actualizada}`);
    }),
  );
  return { porNumero, huella: huella.sort() };
}

// Bajar una imagen de una URL pública (la del fabricante, por el conector
// MCP). Solo https, solo imágenes, con tope de tamaño y de tiempo.
export async function bajarImagenDeUrl(url: string): Promise<Buffer> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("La URL de la imagen no es válida.");
  }
  if (u.protocol !== "https:") throw new Error("La imagen debe venir de una URL https.");
  const res = await fetch(u, {
    signal: AbortSignal.timeout(20_000),
    redirect: "follow",
    headers: { "user-agent": "Mozilla/5.0 (adjudicado.app)", accept: "image/*" },
  });
  if (!res.ok) throw new Error(`El sitio respondió ${res.status} al bajar la imagen.`);
  const largo = Number(res.headers.get("content-length") ?? 0);
  if (largo > MAX_IMAGEN_MB * 1024 * 1024) throw new Error(`La imagen pesa más de ${MAX_IMAGEN_MB} MB.`);
  return Buffer.from(await res.arrayBuffer());
}
