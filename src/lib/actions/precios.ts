"use server";

// Server actions de la herramienta Precios: puente entre los componentes
// cliente (búsqueda instantánea, peek, anotaciones) y la capa de datos.

import { revalidatePath } from "next/cache";
import { getMiembro } from "@/lib/auth";
import {
  activarListaPrecio,
  buscarPrecios,
  comentarPrecio,
  detallePrecio,
  eliminarComentarioPrecio,
  eliminarListaPrecio,
  marcarPrecio,
} from "@/lib/precios/queries";
import type {
  ComentarioPrecio,
  DetallePrecio,
  FacetasPrecios,
  FiltrosPrecios,
  ProductoPrecio,
} from "@/lib/precios/tipos";

export async function buscarPreciosAction(
  q: string,
  filtros: FiltrosPrecios = {},
): Promise<{ productos: ProductoPrecio[]; facetas: FacetasPrecios | null }> {
  return buscarPrecios(q, filtros);
}

export async function detallePrecioAction(
  suplidorId: string,
  sku: string,
): Promise<DetallePrecio | null> {
  return detallePrecio(suplidorId, sku);
}

export async function marcarPrecioAction(
  suplidorId: string,
  sku: string,
  color: string | null,
): Promise<void> {
  return marcarPrecio(suplidorId, sku, color);
}

export async function comentarPrecioAction(
  suplidorId: string,
  sku: string,
  texto: string,
): Promise<ComentarioPrecio | null> {
  return comentarPrecio(suplidorId, sku, texto);
}

export async function eliminarComentarioPrecioAction(id: string): Promise<void> {
  return eliminarComentarioPrecio(id);
}

export async function activarListaAction(listaId: string): Promise<string | null> {
  const error = await activarListaPrecio(listaId);
  if (!error) revalidatePath("/precios", "layout");
  return error;
}

export async function eliminarListaAction(listaId: string): Promise<string | null> {
  const error = await eliminarListaPrecio(listaId);
  if (!error) revalidatePath("/precios", "layout");
  return error;
}

// La carpeta donde el navegador debe dejar el Excel antes de importarlo.
//
// El archivo sube DIRECTO al almacenamiento (Vercel rechaza cualquier cuerpo
// mayor de 4,5 MB antes de ejecutar nada), y la RLS del bucket exige que la
// primera carpeta sea la de la organización. El navegador no conoce ese id,
// así que lo pide aquí en vez de recibirlo por props a través de dos niveles
// de componentes.
export async function carpetaDeImportacion(): Promise<string | null> {
  const miembro = await getMiembro();
  return miembro ? `${miembro.org_id}/importaciones` : null;
}
