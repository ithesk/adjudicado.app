"use server";

// Server actions del módulo de Licitaciones: puente delgado entre los
// componentes cliente y la capa de datos.

import { revalidatePath } from "next/cache";
import {
  actualizarItem,
  actualizarProceso,
  actualizarRequisito,
  cotizarItemCatalogo,
  construirCanonico,
  crearItem,
  crearProceso,
  crearRequisito,
  eliminarItem,
  eliminarProceso,
  eliminarRequisito,
  guardarFirmante,
  guardarPerfil,
  subirArchivoRequisito,
  type NuevoProceso,
  type ResultadoCanonico,
} from "@/lib/licitaciones/queries";
import type {
  EmpresaPerfil,
  LicItem,
  LicProceso,
  LicRequisito,
  RolFirmante,
} from "@/lib/licitaciones/tipos";

function refrescar() {
  revalidatePath("/licitaciones", "layout");
}

export async function crearProcesoAction(datos: NuevoProceso) {
  const r = await crearProceso(datos);
  if (r.id) refrescar();
  return r;
}

export async function actualizarProcesoAction(
  id: string,
  patch: Parameters<typeof actualizarProceso>[1],
): Promise<string | null> {
  const error = await actualizarProceso(id, patch);
  if (!error) refrescar();
  return error;
}

export async function eliminarProcesoAction(id: string): Promise<string | null> {
  const error = await eliminarProceso(id);
  if (!error) refrescar();
  return error;
}

export async function crearItemAction(procesoId: string): Promise<string | null> {
  const error = await crearItem(procesoId);
  if (!error) refrescar();
  return error;
}

export async function actualizarItemAction(
  id: string,
  patch: Parameters<typeof actualizarItem>[1],
): Promise<string | null> {
  const error = await actualizarItem(id, patch);
  if (!error) refrescar();
  return error;
}

export async function eliminarItemAction(id: string): Promise<string | null> {
  const error = await eliminarItem(id);
  if (!error) refrescar();
  return error;
}

export async function cotizarItemAction(
  itemId: string,
  origen: { suplidor_id: string; sku: string; costo_usd: number },
): Promise<string | null> {
  const error = await cotizarItemCatalogo(itemId, origen);
  if (!error) refrescar();
  return error;
}

export async function crearRequisitoAction(
  procesoId: string,
  datos: Parameters<typeof crearRequisito>[1],
): Promise<string | null> {
  const error = await crearRequisito(procesoId, datos);
  if (!error) refrescar();
  return error;
}

export async function actualizarRequisitoAction(
  id: string,
  patch: Parameters<typeof actualizarRequisito>[1],
): Promise<string | null> {
  const error = await actualizarRequisito(id, patch);
  if (!error) refrescar();
  return error;
}

export async function eliminarRequisitoAction(id: string): Promise<string | null> {
  const error = await eliminarRequisito(id);
  if (!error) refrescar();
  return error;
}

export async function subirArchivoRequisitoAction(
  requisitoId: string,
  formData: FormData,
): Promise<string | null> {
  const error = await subirArchivoRequisito(requisitoId, formData);
  if (!error) refrescar();
  return error;
}

export async function guardarPerfilAction(
  perfil: Omit<EmpresaPerfil, "org_id" | "updated_at">,
): Promise<string | null> {
  const error = await guardarPerfil(perfil);
  if (!error) refrescar();
  return error;
}

export async function guardarFirmanteAction(
  rol: RolFirmante,
  datos: { nombre: string; cedula: string | null; cargo: string | null },
): Promise<string | null> {
  const error = await guardarFirmante(rol, datos);
  if (!error) refrescar();
  return error;
}

export async function validarCanonicoAction(
  procesoId: string,
): Promise<ResultadoCanonico> {
  return construirCanonico(procesoId);
}

export type { LicItem, LicProceso, LicRequisito };
