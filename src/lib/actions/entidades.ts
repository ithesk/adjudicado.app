"use server";

// Server actions del catálogo de entidades del Estado (tabla `institucion`).
// Es el MISMO catálogo que enlazan las órdenes (al llegar la OC) y las
// licitaciones (al crear el proceso): una entidad, una fila.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMiembro } from "@/lib/auth";
import { isDemo } from "@/lib/demo";
import { normalizarEntidad } from "@/lib/types";

function refrescar() {
  revalidatePath("/configuracion/entidades");
  revalidatePath("/licitaciones", "layout");
}

export async function crearEntidadAction(nombre: string): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  const limpio = nombre.trim().replace(/\s+/g, " ");
  if (!limpio) return "El nombre es obligatorio.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();

  // Evitar duplicados por acentos/mayúsculas: "Lotería" ya existe si hay "LOTERIA".
  const { data: todas } = await supabase
    .from("institucion")
    .select("nombre")
    .eq("org_id", miembro.org_id);
  const norm = normalizarEntidad(limpio);
  if (todas?.some((i) => normalizarEntidad(i.nombre) === norm)) {
    return `Ya existe una entidad con ese nombre.`;
  }

  const { error } = await supabase
    .from("institucion")
    .insert({ org_id: miembro.org_id, nombre: limpio });
  refrescar();
  return error ? `No se pudo crear: ${error.message}` : null;
}

export async function actualizarEntidadAction(
  id: string,
  patch: Partial<{
    nombre: string;
    siglas: string | null;
    rnc: string | null;
    direccion: string | null;
  }>,
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  if (patch.nombre !== undefined && !patch.nombre.trim()) {
    return "El nombre no puede quedar vacío.";
  }
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("institucion")
    .update(patch)
    .eq("id", id)
    .eq("org_id", miembro.org_id);
  if (!error) refrescar();
  return error ? `No se pudo guardar: ${error.message}` : null;
}

export async function eliminarEntidadAction(id: string): Promise<string | null> {
  if (isDemo()) return "En modo demo no se borra.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("institucion")
    .delete()
    .eq("id", id)
    .eq("org_id", miembro.org_id);
  if (!error) refrescar();
  if (error?.code === "23503") {
    return "Esta entidad tiene órdenes o procesos vinculados — no se puede eliminar.";
  }
  return error ? `No se pudo eliminar: ${error.message}` : null;
}
