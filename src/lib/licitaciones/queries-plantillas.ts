// Capa de datos del constructor de plantillas. Mismo contrato de la casa:
// lecturas con orgActivaLigera, mutaciones con getMiembro + org defensivo.

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getMiembro, getUser, orgActivaLigera } from "@/lib/auth";
import { isDemo } from "@/lib/demo";
import { aplicarAsignaciones } from "./plantillas";
import type { Asignacion, VariablePersonalizada } from "./variables";

export interface LicPlantilla {
  id: string;
  org_id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  archivo_original: string;
  archivo_tpl: string | null;
  asignaciones: Asignacion[];
  variables_personalizadas: VariablePersonalizada[];
  estado: "borrador" | "lista";
  // null = genérica de la organización; con valor = variante que gana
  // cuando el proceso es de esa entidad (cascada entidad → org → sistema).
  institucion_id: string | null;
  created_at: string;
  updated_at: string;
  // Solo en el listado: la entidad de la variante, para mostrarla.
  institucion?: { id: string; nombre: string; siglas: string | null } | null;
}

export async function listarPlantillas(): Promise<LicPlantilla[]> {
  if (isDemo()) return [];
  const orgId = await orgActivaLigera();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("lic_plantilla")
    .select("*, institucion:institucion_id(id, nombre, siglas)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  return (data as LicPlantilla[] | null) ?? [];
}

export async function obtenerPlantilla(id: string): Promise<LicPlantilla | null> {
  if (isDemo()) return null;
  const orgId = await orgActivaLigera();
  if (!orgId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("lic_plantilla")
    .select("*, institucion:institucion_id(id, nombre, siglas)")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  return (data as LicPlantilla | null) ?? null;
}

const MAX_MB = 15;

// Sube el .docx y crea el borrador. Devuelve el id para ir directo al editor.
export async function crearPlantilla(
  formData: FormData,
): Promise<{ id?: string; error?: string }> {
  if (isDemo()) return { error: "En modo demo no se guardan cambios." };
  const miembro = await getMiembro();
  if (!miembro) return { error: "No autorizado." };

  const archivo = formData.get("archivo");
  const nombre = String(formData.get("nombre") || "").trim();
  const codigo = String(formData.get("codigo") || "").trim().toUpperCase();
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Elige un archivo .docx." };
  if (!archivo.name.toLowerCase().endsWith(".docx")) {
    return { error: "Solo .docx (Word). Los PDF planos vienen en una versión futura." };
  }
  if (archivo.size > MAX_MB * 1024 * 1024) return { error: `El archivo pesa más de ${MAX_MB} MB.` };
  if (!nombre || !codigo) return { error: "Nombre y código son obligatorios." };

  const supabase = await createClient();
  const path = `${miembro.org_id}/plantillas/${randomUUID()}.docx`;
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const { error: errSubida } = await supabase.storage
    .from("documentos")
    .upload(path, bytes, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  if (errSubida) return { error: `No se pudo subir: ${errSubida.message}` };

  const { data, error } = await supabase
    .from("lic_plantilla")
    .insert({
      org_id: miembro.org_id,
      codigo,
      nombre,
      archivo_original: path,
    })
    .select("id")
    .single();
  if (error) {
    await supabase.storage.from("documentos").remove([path]);
    if (error.code === "23505") return { error: `Ya existe una plantilla con el código ${codigo}.` };
    return { error: `No se pudo crear: ${error.message}` };
  }
  return { id: data.id };
}

// Autosave del editor.
export async function guardarAsignaciones(
  id: string,
  asignaciones: Asignacion[],
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("lic_plantilla")
    .update({ asignaciones, estado: "borrador" })
    .eq("id", id)
    .eq("org_id", miembro.org_id);
  return error ? `No se pudo guardar: ${error.message}` : null;
}

export async function guardarVariablesPersonalizadas(
  id: string,
  variables: VariablePersonalizada[],
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("lic_plantilla")
    .update({ variables_personalizadas: variables, estado: "borrador" })
    .eq("id", id)
    .eq("org_id", miembro.org_id);
  return error ? `No se pudo guardar: ${error.message}` : null;
}

// "Guardar": aplica las asignaciones al original, sube el taggeado y la
// plantilla queda LISTA para usarse en la generación.
export async function publicarPlantilla(id: string): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();

  const { data: fila } = await supabase
    .from("lic_plantilla")
    .select("*")
    .eq("id", id)
    .eq("org_id", miembro.org_id)
    .maybeSingle();
  const plantilla = fila as LicPlantilla | null;
  if (!plantilla) return "Plantilla no encontrada.";
  if (plantilla.asignaciones.length === 0) return "Asigna al menos una variable antes de guardar.";

  const { data: original } = await supabase.storage
    .from("documentos")
    .download(plantilla.archivo_original);
  if (!original) return "No se pudo leer el archivo original.";

  let taggeado: Buffer;
  try {
    taggeado = aplicarAsignaciones(
      Buffer.from(await original.arrayBuffer()),
      plantilla.asignaciones,
      plantilla.variables_personalizadas.map((v) => v.clave),
    );
  } catch (e) {
    return `No se pudo taggear: ${e instanceof Error ? e.message : String(e)}`;
  }

  const rutaTpl = plantilla.archivo_original.replace(/\.docx$/, "-tpl.docx");
  const { error: errSubida } = await supabase.storage
    .from("documentos")
    .upload(rutaTpl, taggeado, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });
  if (errSubida) return `No se pudo subir la plantilla: ${errSubida.message}`;

  const { error } = await supabase
    .from("lic_plantilla")
    .update({ archivo_tpl: rutaTpl, estado: "lista" })
    .eq("id", id)
    .eq("org_id", miembro.org_id);
  return error ? `No se pudo publicar: ${error.message}` : null;
}

export async function eliminarPlantilla(id: string): Promise<string | null> {
  if (isDemo()) return "En modo demo no se borra.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();
  const { data: fila } = await supabase
    .from("lic_plantilla")
    .select("nombre, archivo_original, archivo_tpl, institucion_id")
    .eq("id", id)
    .eq("org_id", miembro.org_id)
    .maybeSingle();
  const { error } = await supabase
    .from("lic_plantilla")
    .delete()
    .eq("id", id)
    .eq("org_id", miembro.org_id);
  if (error) return `No se pudo eliminar: ${error.message}`;
  if (fila?.institucion_id) {
    await registrarEventoEntidad(
      fila.institucion_id,
      miembro.org_id,
      `Eliminó la plantilla propia "${fila.nombre}"`,
    );
  }
  const rutas = [fila?.archivo_original, fila?.archivo_tpl].filter(Boolean) as string[];
  if (rutas.length) await supabase.storage.from("documentos").remove(rutas);
  return null;
}

// El movimiento queda escrito en la bitácora de la entidad (chatter).
async function registrarEventoEntidad(
  institucionId: string,
  orgId: string,
  texto: string,
) {
  const supabase = await createClient();
  const user = await getUser();
  await supabase.from("institucion_evento").insert({
    org_id: orgId,
    institucion_id: institucionId,
    autor_id: user?.id ?? null,
    tipo: "plantilla",
    texto,
  });
}

// "Crear variante para una entidad": duplica una plantilla YA construida
// (archivos + variables) asignada a la entidad. Solo se edita lo que esa
// entidad cambió — nunca se re-taggea desde cero.
export async function duplicarPlantillaParaEntidad(
  id: string,
  institucionId: string,
): Promise<{ id?: string; error?: string }> {
  if (isDemo()) return { error: "En modo demo no se guardan cambios." };
  const miembro = await getMiembro();
  if (!miembro) return { error: "No autorizado." };
  const supabase = await createClient();

  const [{ data: fila }, { data: entidad }] = await Promise.all([
    supabase
      .from("lic_plantilla")
      .select("*")
      .eq("id", id)
      .eq("org_id", miembro.org_id)
      .maybeSingle(),
    supabase
      .from("institucion")
      .select("id, nombre, siglas")
      .eq("id", institucionId)
      .eq("org_id", miembro.org_id)
      .maybeSingle(),
  ]);
  const base = fila as LicPlantilla | null;
  if (!base) return { error: "Plantilla no encontrada." };
  if (!entidad) return { error: "Entidad no encontrada." };
  if (base.institucion_id === institucionId) {
    return { error: "Esta plantilla ya es la variante de esa entidad." };
  }

  // Copia los archivos en storage para que la variante viva sola.
  const copiar = async (origen: string | null): Promise<string | null> => {
    if (!origen) return null;
    const { data: archivo } = await supabase.storage.from("documentos").download(origen);
    if (!archivo) return null;
    const destino = `${miembro.org_id}/plantillas/${randomUUID()}${origen.endsWith("-tpl.docx") ? "-tpl.docx" : ".docx"}`;
    const { error: errSubida } = await supabase.storage
      .from("documentos")
      .upload(destino, new Uint8Array(await archivo.arrayBuffer()), {
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
    return errSubida ? null : destino;
  };
  const original = await copiar(base.archivo_original);
  if (!original) return { error: "No se pudo copiar el archivo de la plantilla." };
  const tpl = await copiar(base.archivo_tpl);

  const { data: creada, error } = await supabase
    .from("lic_plantilla")
    .insert({
      org_id: miembro.org_id,
      codigo: base.codigo,
      nombre: base.nombre,
      descripcion: base.descripcion,
      archivo_original: original,
      archivo_tpl: tpl,
      asignaciones: base.asignaciones,
      variables_personalizadas: base.variables_personalizadas,
      estado: tpl ? base.estado : "borrador",
      institucion_id: institucionId,
    })
    .select("id")
    .single();
  if (error) {
    await supabase.storage
      .from("documentos")
      .remove([original, tpl].filter(Boolean) as string[]);
    if (error.code === "23505") {
      return { error: `${entidad.siglas ?? entidad.nombre} ya tiene su variante de ${base.codigo}.` };
    }
    return { error: `No se pudo crear la variante: ${error.message}` };
  }

  await registrarEventoEntidad(
    institucionId,
    miembro.org_id,
    `Creó la plantilla propia "${base.nombre}" (${base.codigo}) — variante de la genérica`,
  );
  return { id: creada.id };
}
