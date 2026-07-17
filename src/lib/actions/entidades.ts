"use server";

// Server actions del catálogo de entidades del Estado (tabla `institucion`).
// Es el MISMO catálogo que enlazan las órdenes (al llegar la OC) y las
// licitaciones (al crear el proceso): una entidad, una fila.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMiembro, getUser } from "@/lib/auth";
import { isDemo } from "@/lib/demo";
import { normalizarEntidad } from "@/lib/types";

function refrescar() {
  revalidatePath("/configuracion/entidades");
  revalidatePath("/entidades", "layout");
  revalidatePath("/licitaciones", "layout");
}

// Todo movimiento sobre la entidad queda escrito en su bitácora.
async function registrarEvento(
  institucionId: string,
  orgId: string,
  tipo: "perfil" | "logo" | "contacto" | "asignacion" | "nota",
  texto: string,
) {
  const supabase = await createClient();
  const user = await getUser();
  await supabase.from("institucion_evento").insert({
    org_id: orgId,
    institucion_id: institucionId,
    autor_id: user?.id ?? null,
    tipo,
    texto,
  });
}

const ETIQUETA_CAMPO: Record<string, string> = {
  nombre: "el nombre",
  siglas: "las siglas",
  rnc: "el RNC",
  direccion: "la dirección",
  telefono: "el teléfono",
  notas: "las notas",
};

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
    telefono: string | null;
    notas: string | null;
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
  if (!error) {
    const campos = Object.keys(patch)
      .map((c) => ETIQUETA_CAMPO[c] ?? c)
      .join(", ");
    await registrarEvento(id, miembro.org_id, "perfil", `Actualizó ${campos}`);
    refrescar();
  }
  return error ? `No se pudo guardar: ${error.message}` : null;
}

// ---------- Logo ----------

export async function subirLogoEntidadAction(
  id: string,
  formData: FormData,
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const archivo = formData.get("logo");
  if (!(archivo instanceof File) || archivo.size === 0) return "Elige una imagen.";
  const ext = archivo.name.toLowerCase().match(/\.(png|jpe?g|webp|svg)$/)?.[0];
  if (!ext) return "Solo imágenes (png, jpg, webp, svg).";
  if (archivo.size > 3 * 1024 * 1024) return "La imagen pesa más de 3 MB.";

  const supabase = await createClient();
  const path = `${miembro.org_id}/entidades/${id}/logo${ext}`;
  const { error: errSubida } = await supabase.storage
    .from("documentos")
    .upload(path, new Uint8Array(await archivo.arrayBuffer()), {
      contentType: archivo.type || "image/png",
      upsert: true,
    });
  if (errSubida) return `No se pudo subir: ${errSubida.message}`;
  const { error } = await supabase
    .from("institucion")
    .update({ logo_url: path })
    .eq("id", id)
    .eq("org_id", miembro.org_id);
  if (error) return `No se pudo guardar: ${error.message}`;
  await registrarEvento(id, miembro.org_id, "logo", "Subió el logo");
  refrescar();
  return null;
}

// ---------- Contactos ----------

export async function crearContactoEntidadAction(
  institucionId: string,
  datos: { nombre: string; rol: string; email: string; telefono: string; extension: string },
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  const nombre = datos.nombre.trim();
  if (!nombre) return "El nombre del contacto es obligatorio.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();
  const { error } = await supabase.from("contacto").insert({
    org_id: miembro.org_id,
    institucion_id: institucionId,
    nombre,
    rol: datos.rol.trim() || null,
    email: datos.email.trim() || null,
    telefono: datos.telefono.trim() || null,
    extension: datos.extension.trim() || null,
  });
  if (!error) {
    await registrarEvento(institucionId, miembro.org_id, "contacto", `Agregó el contacto ${nombre}`);
    refrescar();
  }
  return error ? `No se pudo agregar: ${error.message}` : null;
}

export async function actualizarContactoEntidadAction(
  institucionId: string,
  contactoId: string,
  patch: Partial<{ nombre: string; rol: string | null; email: string | null; telefono: string | null; extension: string | null; notas: string | null }>,
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacto")
    .update(patch)
    .eq("id", contactoId)
    .eq("org_id", miembro.org_id);
  if (!error) refrescar(); // ajustes menores no ensucian la bitácora
  return error ? `No se pudo guardar: ${error.message}` : null;
}

export async function eliminarContactoEntidadAction(
  institucionId: string,
  contactoId: string,
  nombre: string,
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se borra.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacto")
    .delete()
    .eq("id", contactoId)
    .eq("org_id", miembro.org_id);
  if (!error) {
    await registrarEvento(institucionId, miembro.org_id, "contacto", `Eliminó el contacto ${nombre}`);
    refrescar();
  }
  return error ? `No se pudo eliminar: ${error.message}` : null;
}

// ---------- Asignación (persona o grupo) ----------

export async function toggleAsignacionEntidadAction(
  institucionId: string,
  destino: { userId?: string; grupoId?: string },
  nombre: string,
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  if (!destino.userId && !destino.grupoId) return "Falta la persona o el grupo.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();

  const filtro = supabase
    .from("institucion_asignacion")
    .select("id")
    .eq("institucion_id", institucionId);
  const { data: existente } = destino.userId
    ? await filtro.eq("user_id", destino.userId).maybeSingle()
    : await filtro.eq("grupo_id", destino.grupoId!).maybeSingle();

  if (existente) {
    const { error } = await supabase
      .from("institucion_asignacion")
      .delete()
      .eq("id", existente.id)
      .eq("org_id", miembro.org_id);
    if (error) return `No se pudo quitar: ${error.message}`;
    await registrarEvento(institucionId, miembro.org_id, "asignacion", `Quitó la asignación de ${nombre}`);
  } else {
    const { error } = await supabase.from("institucion_asignacion").insert({
      org_id: miembro.org_id,
      institucion_id: institucionId,
      user_id: destino.userId ?? null,
      grupo_id: destino.grupoId ?? null,
    });
    if (error) return `No se pudo asignar: ${error.message}`;
    await registrarEvento(institucionId, miembro.org_id, "asignacion", `Asignó la entidad a ${nombre}`);
  }
  refrescar();
  return null;
}

// ---------- Nota manual en la bitácora ----------

export async function agregarNotaEntidadAction(
  institucionId: string,
  texto: string,
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  const limpio = texto.trim();
  if (!limpio) return "La nota está vacía.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  await registrarEvento(institucionId, miembro.org_id, "nota", limpio);
  refrescar();
  return null;
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
