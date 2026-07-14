"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMiembro, getUser } from "@/lib/auth";
import { isDemo } from "@/lib/demo";
import { tipoDoc } from "@/lib/empresa/documentos";

const MAX_MB = 15;
const EXT_OK = ["pdf", "png", "jpg", "jpeg", "webp", "doc", "docx"];

// El layout pinta la insignia de vencimientos, así que hay que refrescarlo
// entero además de la pestaña.
function refrescar() {
  revalidatePath("/configuracion/empresa");
  revalidatePath("/", "layout");
}

// A diferencia de `subirDocumento` (órdenes), esta valida y DEVUELVE el error
// en vez de fallar en silencio.
export async function subirDocEmpresa(
  formData: FormData,
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan documentos.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const user = await getUser();

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return "Elige un archivo.";
  }
  if (archivo.size > MAX_MB * 1024 * 1024) {
    return `El archivo pesa más de ${MAX_MB} MB.`;
  }

  const ext = (archivo.name.split(".").pop() || "").toLowerCase();
  if (!EXT_OK.includes(ext)) {
    return `Formato no admitido (${EXT_OK.join(", ")}).`;
  }

  const tipo = tipoDoc(String(formData.get("tipo") || "otro")).codigo;
  const nombre = String(formData.get("nombre") || "").trim() || archivo.name;
  const emision = String(formData.get("fecha_emision") || "") || null;
  const vencimiento = String(formData.get("fecha_vencimiento") || "") || null;

  const supabase = await createClient();
  const path = `${miembro.org_id}/empresa/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await archivo.arrayBuffer());

  const { error: errSubida } = await supabase.storage
    .from("documentos")
    .upload(path, bytes, {
      contentType: archivo.type || "application/octet-stream",
    });
  if (errSubida) return `No se pudo subir el archivo: ${errSubida.message}`;

  const { error } = await supabase.from("documento_empresa").insert({
    org_id: miembro.org_id,
    tipo,
    nombre,
    archivo_url: path,
    fecha_emision: emision,
    fecha_vencimiento: vencimiento,
    subido_por: user?.id ?? null,
  });
  if (error) {
    // No dejar el archivo huérfano en Storage si la fila no entró.
    await supabase.storage.from("documentos").remove([path]);
    return `No se pudo guardar: ${error.message}`;
  }

  refrescar();
  return null;
}

export async function actualizarFechasDocEmpresa(
  id: string,
  fechaEmision: string | null,
  fechaVencimiento: string | null,
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";

  const supabase = await createClient();
  const { error } = await supabase
    .from("documento_empresa")
    .update({
      fecha_emision: fechaEmision || null,
      fecha_vencimiento: fechaVencimiento || null,
    })
    .eq("id", id)
    .eq("org_id", miembro.org_id);
  if (error) return `No se pudo actualizar: ${error.message}`;

  refrescar();
  return null;
}

export async function eliminarDocEmpresa(id: string): Promise<string | null> {
  if (isDemo()) return "En modo demo no se borran documentos.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documento_empresa")
    .select("archivo_url")
    .eq("id", id)
    .eq("org_id", miembro.org_id)
    .maybeSingle();

  const { error } = await supabase
    .from("documento_empresa")
    .delete()
    .eq("id", id)
    .eq("org_id", miembro.org_id);
  if (error) return `No se pudo eliminar: ${error.message}`;

  if (doc?.archivo_url) {
    await supabase.storage.from("documentos").remove([doc.archivo_url]);
  }

  refrescar();
  return null;
}
