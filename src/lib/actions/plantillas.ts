"use server";

// Server actions del constructor de plantillas: puente delgado.
// (Regla de la casa: NUNCA `export type` en archivos "use server".)

import { revalidatePath } from "next/cache";
import {
  crearPlantilla,
  duplicarPlantillaParaEntidad,
  eliminarPlantilla,
  guardarAsignaciones,
  guardarVariablesPersonalizadas,
  publicarPlantilla,
} from "@/lib/licitaciones/queries-plantillas";
import type { Asignacion, VariablePersonalizada } from "@/lib/licitaciones/variables";

function refrescar() {
  revalidatePath("/configuracion/plantillas");
}

export async function crearPlantillaAction(formData: FormData) {
  const r = await crearPlantilla(formData);
  if (r.id) refrescar();
  return r;
}

export async function guardarAsignacionesAction(
  id: string,
  asignaciones: Asignacion[],
): Promise<string | null> {
  return guardarAsignaciones(id, asignaciones);
}

export async function guardarVariablesPersonalizadasAction(
  id: string,
  variables: VariablePersonalizada[],
): Promise<string | null> {
  return guardarVariablesPersonalizadas(id, variables);
}

export async function publicarPlantillaAction(id: string): Promise<string | null> {
  const error = await publicarPlantilla(id);
  if (!error) refrescar();
  return error;
}

export async function eliminarPlantillaAction(id: string): Promise<string | null> {
  const error = await eliminarPlantilla(id);
  if (!error) {
    refrescar();
    revalidatePath("/entidades", "layout");
  }
  return error;
}

// Duplica una plantilla como VARIANTE de una entidad (cascada al generar).
export async function crearVariantePlantillaAction(
  id: string,
  institucionId: string,
) {
  const r = await duplicarPlantillaParaEntidad(id, institucionId);
  if (r.id) {
    refrescar();
    revalidatePath("/entidades", "layout");
  }
  return r;
}
