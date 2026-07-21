"use server";

// Server actions del módulo de Licitaciones: puente delgado entre los
// componentes cliente y la capa de datos.

import { revalidatePath } from "next/cache";
import {
  actualizarItem,
  actualizarProceso,
  actualizarRequisito,
  cambiarEstadoSubsanacion,
  cotizarItemCatalogo,
  construirCanonico,
  crearItem,
  crearProceso,
  crearRequisito,
  crearRequisitosLote,
  crearSubsanacion,
  eliminarItem,
  eliminarProceso,
  eliminarRequisito,
  guardarFirmante,
  guardarPerfil,
  reordenarItems,
  subirArchivoRequisito,
  toggleRequisitoSubsanacion,
  type NuevoProceso,
  type ResultadoCanonico,
} from "@/lib/licitaciones/queries";
import type { EmpresaPerfil, RolFirmante } from "@/lib/licitaciones/tipos";

function refrescar() {
  revalidatePath("/licitaciones", "layout");
  revalidatePath("/configuracion/empresa");
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

export async function reordenarItemsAction(
  procesoId: string,
  ids: string[],
): Promise<string | null> {
  const error = await reordenarItems(procesoId, ids);
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

export async function crearRequisitosLoteAction(
  procesoId: string,
  codigos: string[],
): Promise<string | null> {
  const error = await crearRequisitosLote(procesoId, codigos);
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

// Autosave: recibe solo los campos que cambiaron.
export async function guardarPerfilAction(
  patch: Partial<Omit<EmpresaPerfil, "org_id" | "updated_at">>,
): Promise<string | null> {
  const error = await guardarPerfil(patch);
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

// ===== Subsanación =====

export async function crearSubsanacionAction(
  procesoId: string,
  fechaLimite: string,
  texto: string,
): Promise<string | null> {
  const error = await crearSubsanacion(procesoId, fechaLimite, texto);
  if (!error) {
    refrescar();
    revalidatePath("/entidades", "layout");
  }
  return error;
}

export async function cambiarEstadoSubsanacionAction(
  id: string,
  estado: "enviada" | "cerrada",
): Promise<string | null> {
  const error = await cambiarEstadoSubsanacion(id, estado);
  if (!error) {
    refrescar();
    revalidatePath("/entidades", "layout");
  }
  return error;
}

export async function toggleRequisitoSubsanacionAction(
  requisitoId: string,
  subsanacionId: string | null,
): Promise<string | null> {
  const error = await toggleRequisitoSubsanacion(requisitoId, subsanacionId);
  if (!error) refrescar();
  return error;
}
