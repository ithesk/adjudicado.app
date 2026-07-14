"use server";

import { redirect } from "next/navigation";
import { getMiembro, getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { TipoItem } from "@/lib/types";

interface ItemEntrada {
  nombre: string;
  tipo: TipoItem;
  cantidad: number;
  monto?: number | null; // monto del ítem en la OC → item.precio
}

export type CrearState = { error?: string };

export async function crearOrden(
  _prev: CrearState,
  formData: FormData,
): Promise<CrearState> {
  const user = await getUser();
  const miembro = await getMiembro();
  if (!user || !miembro) redirect("/login");

  const get = (k: string) => String(formData.get(k) || "").trim();

  const numero_oc = get("numero_oc") || null;
  const institucion = get("institucion") || null;
  const codigo_expediente = get("codigo_expediente") || null;
  const fecha_oc = get("fecha_oc") || null;
  const moneda = get("moneda") === "USD" ? "USD" : "DOP";
  const montoStr = get("monto");
  const monto = montoStr ? Number(montoStr) : null;
  const plazo_entrega = get("plazo_entrega") || null;
  const archivo_path = get("archivo_path") || null;

  if (!plazo_entrega) {
    return { error: "Ingresa el plazo de entrega (es obligatorio)." };
  }

  let items: ItemEntrada[] = [];
  try {
    const raw = get("items_json");
    items = raw ? (JSON.parse(raw) as ItemEntrada[]) : [];
  } catch {
    items = [];
  }

  let ocr_raw: unknown = null;
  try {
    const raw = get("ocr_raw");
    ocr_raw = raw ? JSON.parse(raw) : null;
  } catch {
    ocr_raw = null;
  }

  const supabase = await createClient();

  const { data: orden, error } = await supabase
    .from("orden")
    .insert({
      org_id: miembro.org_id,
      numero_oc,
      institucion,
      codigo_expediente,
      fecha_oc,
      moneda,
      monto,
      plazo_entrega,
      oc_archivo_url: archivo_path,
      ocr_raw,
      creado_por: user.id,
    })
    .select("id")
    .single();

  if (error || !orden) {
    return { error: "No se pudo crear la orden: " + (error?.message ?? "") };
  }

  if (items.length > 0) {
    const filas = items.map((it, i) => ({
      orden_id: orden.id,
      nombre: it.nombre || "Ítem sin nombre",
      tipo: (["licencia", "fisico", "servicio"] as TipoItem[]).includes(it.tipo)
        ? it.tipo
        : "licencia",
      cantidad: Number(it.cantidad) || 1,
      precio: Number(it.monto) > 0 ? Number(it.monto) : null,
      orden_indice: i,
    }));
    await supabase.from("item").insert(filas);
  }

  redirect(`/orden/${orden.id}`);
}
