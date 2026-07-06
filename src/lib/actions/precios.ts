"use server";

// Server actions de la herramienta Precios: puente entre los componentes
// cliente (búsqueda instantánea, peek, anotaciones) y la capa de datos.

import { revalidatePath } from "next/cache";
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
