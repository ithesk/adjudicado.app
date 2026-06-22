"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getMiembro, getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";
import {
  siguienteEstado,
  type Estado,
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
  await supabase.from("item").update(limpio).eq("id", itemId);
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
