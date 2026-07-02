"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getMiembro, getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";
import {
  siguienteEstado,
  tipoPorArchivo,
  type Estado,
  type Item,
  type SuplidorEstado,
  type TipoBitacora,
} from "@/lib/types";

function refrescar(ordenId: string) {
  revalidatePath(`/orden/${ordenId}`);
  revalidatePath("/");
}

// Avanza la orden al siguiente estado de la máquina (incluye handoff a Odoo).
export async function avanzarEstado(ordenId: string, desde: Estado) {
  if (isDemo()) return;
  const supabase = await createClient();
  const proximo = siguienteEstado(desde);
  if (!proximo) return;
  await supabase
    .from("orden")
    .update({ estado: proximo })
    .eq("id", ordenId)
    .eq("estado", desde); // optimista: solo si no cambió mientras tanto
  refrescar(ordenId);
}

// Permite fijar un estado puntual (p. ej. retroceder o marcar cobrado).
export async function fijarEstado(ordenId: string, estado: Estado) {
  if (isDemo()) return;
  const supabase = await createClient();
  await supabase.from("orden").update({ estado }).eq("id", ordenId);
  refrescar(ordenId);
}

export async function toggleItem(
  ordenId: string,
  itemId: string,
  entregado: boolean,
) {
  if (isDemo()) return;
  const supabase = await createClient();
  await supabase
    .from("item")
    .update({
      entregado,
      fecha_entrega: entregado ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", itemId);

  // Si todos los ítems quedaron entregados, la orden pasa a 'entregado'.
  const { data: items } = await supabase
    .from("item")
    .select("entregado")
    .eq("orden_id", ordenId);
  const { data: orden } = await supabase
    .from("orden")
    .select("estado")
    .eq("id", ordenId)
    .single();

  if (
    items &&
    items.length > 0 &&
    items.every((i) => i.entregado) &&
    orden &&
    (orden.estado === "orden_recibida" || orden.estado === "en_coordinacion")
  ) {
    await supabase
      .from("orden")
      .update({ estado: "entregado" })
      .eq("id", ordenId);
  }

  refrescar(ordenId);
}

export async function asignarResponsable(
  ordenId: string,
  responsableId: string | null,
) {
  if (isDemo()) return;
  const supabase = await createClient();
  await supabase
    .from("orden")
    .update({ responsable_id: responsableId })
    .eq("id", ordenId);
  refrescar(ordenId);
}

// Colaboradores de una orden (además del responsable líder).
export async function actualizarColaboradores(
  ordenId: string,
  userIds: string[],
) {
  if (isDemo()) return;
  const supabase = await createClient();
  await supabase
    .from("orden")
    .update({ colaboradores: userIds })
    .eq("id", ordenId);
  refrescar(ordenId);
}

// ---------- Editar la orden (corregir lo creado mal) ----------

const CAMPOS_ORDEN = new Set([
  "numero_oc",
  "institucion",
  "codigo_expediente",
  "monto",
  "moneda",
  "fecha_oc",
  "plazo_entrega",
]);

export async function actualizarOrden(
  ordenId: string,
  patch: Record<string, unknown>,
) {
  if (isDemo()) return;
  const limpio: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (CAMPOS_ORDEN.has(k)) limpio[k] = v === "" ? null : v;
  }
  if (Object.keys(limpio).length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase.from("orden").update(limpio).eq("id", ordenId);
  if (error) {
    console.error("actualizarOrden falló:", error.message);
    return;
  }
  refrescar(ordenId);
}

// Elimina una orden completa (ítems, bitácora y documentos se borran en cascada).
export async function eliminarOrden(ordenId: string) {
  if (isDemo()) return;
  const supabase = await createClient();
  const { error } = await supabase.from("orden").delete().eq("id", ordenId);
  if (error) {
    console.error("eliminarOrden falló:", error.message);
    return;
  }
  revalidatePath("/");
  redirect("/");
}

// Crea un ítem nuevo (o un componente si se pasa parentId) y lo devuelve.
export async function agregarItem(
  ordenId: string,
  parentId: string | null = null,
): Promise<Item | null> {
  if (isDemo()) return null;
  const supabase = await createClient();
  // Próximo índice entre los hermanos (mismo padre, o de primer nivel).
  let qb = supabase
    .from("item")
    .select("orden_indice")
    .eq("orden_id", ordenId)
    .order("orden_indice", { ascending: false })
    .limit(1);
  qb = parentId ? qb.eq("parent_id", parentId) : qb.is("parent_id", null);
  const { data: ult } = await qb;
  const indice = ((ult?.[0]?.orden_indice as number | undefined) ?? -1) + 1;
  const { data, error } = await supabase
    .from("item")
    .insert({
      orden_id: ordenId,
      parent_id: parentId,
      nombre: parentId ? "Nuevo componente" : "Nuevo ítem",
      tipo: "licencia",
      cantidad: 1,
      orden_indice: indice,
    })
    .select("*")
    .single();
  if (error) {
    console.error("agregarItem falló:", error.message);
    return null;
  }
  refrescar(ordenId);
  return data as Item;
}

export async function eliminarItem(ordenId: string, itemId: string) {
  if (isDemo()) return;
  const supabase = await createClient();
  await supabase.from("item").delete().eq("id", itemId);
  refrescar(ordenId);
}

// ---------- Persistencia a nivel de ítem ----------

const CAMPOS_ITEM = new Set([
  "suplidor",
  "suplidor_id",
  "canal",
  "estado_item",
  "fecha_estim",
  "precio",
  "condiciones",
  "entregado",
  "fecha_entrega",
  "asignaciones",
  "nombre",
  "cantidad",
  "tipo",
]);

export async function actualizarItem(
  ordenId: string,
  itemId: string,
  patch: Record<string, unknown>,
) {
  if (isDemo()) return;
  const limpio: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    // No colapsar arrays/objetos a null: solo cadenas vacías → null.
    if (CAMPOS_ITEM.has(k)) limpio[k] = v === "" ? null : v;
  }
  if (Object.keys(limpio).length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase.from("item").update(limpio).eq("id", itemId);
  if (error) {
    console.error("actualizarItem falló:", error.message, limpio);
    return;
  }
  refrescar(ordenId);
}

export async function agregarCoordinacionItem(
  ordenId: string,
  itemId: string,
  tipo: TipoBitacora,
  texto: string,
) {
  if (isDemo()) return;
  const limpio = texto.trim();
  if (!limpio) return;
  const user = await getUser();
  const supabase = await createClient();
  await supabase.from("bitacora").insert({
    orden_id: ordenId,
    item_id: itemId,
    autor_id: user?.id ?? null,
    tipo,
    texto: limpio,
  });
  refrescar(ordenId);
}

// Registra un evento automático (avance de ítem, suplidor asignado, marcador…)
// en la bitácora. NO revalida: el feed en vivo ya lo muestra al instante y así
// evitamos que aparezca duplicado en la misma sesión.
export async function registrarEvento(ordenId: string, texto: string) {
  if (isDemo()) return;
  const limpio = texto.trim();
  if (!limpio) return;
  const user = await getUser();
  const supabase = await createClient();
  const { error } = await supabase.from("bitacora").insert({
    orden_id: ordenId,
    autor_id: user?.id ?? null,
    tipo: "evento",
    texto: limpio,
  });
  if (error) console.error("registrarEvento falló:", error.message);
}

export async function agregarBitacora(
  ordenId: string,
  tipo: TipoBitacora,
  texto: string,
) {
  if (isDemo()) return;
  const limpio = texto.trim();
  if (!limpio) return;
  const user = await getUser();
  const supabase = await createClient();
  await supabase.from("bitacora").insert({
    orden_id: ordenId,
    autor_id: user?.id ?? null,
    tipo,
    texto: limpio,
  });
  refrescar(ordenId);
}

// Alterna la reacción del usuario actual sobre una entrada de bitácora.
// No revalida: el panel actualiza en vivo y al recargar se lee de la base.
export async function alternarReaccion(
  _ordenId: string,
  bitacoraId: string,
  emoji: string,
) {
  if (isDemo()) return;
  const user = await getUser();
  if (!user) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("bitacora_reaccion")
    .select("id")
    .eq("bitacora_id", bitacoraId)
    .eq("user_id", user.id)
    .eq("emoji", emoji)
    .maybeSingle();
  if (data) {
    await supabase.from("bitacora_reaccion").delete().eq("id", data.id);
  } else {
    const { error } = await supabase
      .from("bitacora_reaccion")
      .insert({ bitacora_id: bitacoraId, user_id: user.id, emoji });
    if (error) console.error("alternarReaccion falló:", error.message);
  }
}

export async function agregarComentario(
  _ordenId: string,
  bitacoraId: string,
  texto: string,
) {
  if (isDemo()) return;
  const limpio = texto.trim();
  if (!limpio) return;
  const user = await getUser();
  const supabase = await createClient();
  const { error } = await supabase.from("bitacora_comentario").insert({
    bitacora_id: bitacoraId,
    autor_id: user?.id ?? null,
    texto: limpio,
  });
  if (error) console.error("agregarComentario falló:", error.message);
}

// Edita el texto de una entrada propia (estilo Notion). Solo el autor puede.
export async function editarBitacora(
  _ordenId: string,
  bitacoraId: string,
  texto: string,
) {
  if (isDemo()) return;
  const limpio = texto.trim();
  if (!limpio) return;
  const user = await getUser();
  if (!user) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("bitacora")
    .update({ texto: limpio, editada: true })
    .eq("id", bitacoraId)
    .eq("autor_id", user.id); // solo el autor
  if (error) console.error("editarBitacora falló:", error.message);
}

// Elimina una entrada propia (y sus reacciones/comentarios en cascada).
export async function eliminarBitacora(_ordenId: string, bitacoraId: string) {
  if (isDemo()) return;
  const user = await getUser();
  if (!user) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("bitacora")
    .delete()
    .eq("id", bitacoraId)
    .eq("autor_id", user.id); // solo el autor
  if (error) console.error("eliminarBitacora falló:", error.message);
}

export async function actualizarSuplidor(
  ordenId: string,
  suplidor: string,
  estado: string,
  fecha: string,
) {
  if (isDemo()) return;
  const supabase = await createClient();
  const estadoValido: SuplidorEstado | null = (
    ["pedido", "en_transito", "recibido"] as string[]
  ).includes(estado)
    ? (estado as SuplidorEstado)
    : null;
  await supabase
    .from("orden")
    .update({
      suplidor: suplidor.trim() || null,
      suplidor_estado: estadoValido,
      suplidor_fecha_estim: fecha || null,
    })
    .eq("id", ordenId);
  refrescar(ordenId);
}

export async function actualizarPlazos(
  ordenId: string,
  plazoEntrega: string,
  plazoPagoDias: string,
  metodoPago: string,
) {
  if (isDemo()) return;
  const supabase = await createClient();
  await supabase
    .from("orden")
    .update({
      plazo_entrega: plazoEntrega || null,
      plazo_pago_dias: plazoPagoDias ? Number(plazoPagoDias) : null,
      metodo_pago: metodoPago.trim() || null,
    })
    .eq("id", ordenId);
  refrescar(ordenId);
}

export async function agregarEtiqueta(ordenId: string, etiqueta: string) {
  if (isDemo()) return;
  const limpia = etiqueta.trim();
  if (!limpia) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("orden")
    .select("etiquetas")
    .eq("id", ordenId)
    .single();
  const actuales: string[] = data?.etiquetas ?? [];
  if (actuales.includes(limpia)) return;
  await supabase
    .from("orden")
    .update({ etiquetas: [...actuales, limpia] })
    .eq("id", ordenId);
  refrescar(ordenId);
}

export async function quitarEtiqueta(ordenId: string, etiqueta: string) {
  if (isDemo()) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("orden")
    .select("etiquetas")
    .eq("id", ordenId)
    .single();
  const actuales: string[] = data?.etiquetas ?? [];
  await supabase
    .from("orden")
    .update({ etiquetas: actuales.filter((e) => e !== etiqueta) })
    .eq("id", ordenId);
  refrescar(ordenId);
}

// Adjunta un archivo a la bitácora: lo sube a Storage, lo registra como
// documento de la orden (aparece en Documentos y en el repositorio global) y
// crea una entrada de bitácora que lo referencia. itemId opcional = hilo del ítem.
// Devuelve el path para poder abrir el adjunto al instante (optimista).
export async function adjuntarDocumentoBitacora(
  ordenId: string,
  itemId: string | null,
  formData: FormData,
): Promise<{ path: string; nombre: string } | null> {
  if (isDemo()) return null;
  const miembro = await getMiembro();
  const user = await getUser();
  if (!miembro) return null;

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return null;

  const supabase = await createClient();
  const ext = archivo.name.split(".").pop() || "bin";
  const path = `${miembro.org_id}/${ordenId}/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await archivo.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from("documentos")
    .upload(path, bytes, {
      contentType: archivo.type || "application/octet-stream",
    });
  if (upErr) {
    console.error("adjuntar (upload) falló:", upErr.message);
    return null;
  }

  const { data: doc } = await supabase
    .from("documento")
    .insert({
      orden_id: ordenId,
      nombre: archivo.name,
      tipo: "adjunto",
      archivo_url: path,
      subido_por: user?.id ?? null,
    })
    .select("id")
    .single();

  await supabase.from("bitacora").insert({
    orden_id: ordenId,
    item_id: itemId,
    autor_id: user?.id ?? null,
    tipo: tipoPorArchivo(archivo.name),
    texto: archivo.name,
    documento_id: doc?.id ?? null,
  });

  return { path, nombre: archivo.name };
}

export async function subirDocumento(ordenId: string, formData: FormData) {
  if (isDemo()) return;
  const miembro = await getMiembro();
  const user = await getUser();
  if (!miembro) return;

  const archivo = formData.get("archivo");
  const tipo = String(formData.get("tipo") || "otro");
  if (!(archivo instanceof File) || archivo.size === 0) return;

  const supabase = await createClient();
  const ext = archivo.name.split(".").pop() || "bin";
  const path = `${miembro.org_id}/${ordenId}/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await archivo.arrayBuffer());

  const { error } = await supabase.storage
    .from("documentos")
    .upload(path, bytes, {
      contentType: archivo.type || "application/octet-stream",
    });
  if (error) return;

  await supabase.from("documento").insert({
    orden_id: ordenId,
    nombre: archivo.name,
    tipo,
    archivo_url: path,
    subido_por: user?.id ?? null,
  });
  refrescar(ordenId);
}

// Genera una URL firmada temporal para ver/descargar un documento privado.
export async function urlFirmada(
  bucket: "documentos" | "ordenes-oc",
  path: string,
): Promise<string | null> {
  if (isDemo()) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}
