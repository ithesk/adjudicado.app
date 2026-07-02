"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";
import {
  odooConfigurado,
  probarConexion,
  buscarFactura,
  type ResultadoConexion,
  type FacturaOdoo,
} from "@/lib/odoo";

// ── Probar conexión (para la página de integraciones) ────────────────────────

/** Intenta conectar con Odoo y devuelve el resultado de la prueba. */
export async function probarOdoo(): Promise<ResultadoConexion> {
  return probarConexion();
}

// ── Sincronizar factura de una orden con Odoo ────────────────────────────────

export interface ResultadoSincronizacion {
  ok: boolean;
  factura?: FacturaOdoo;
  error?: string;
}

/**
 * Busca en Odoo la factura asociada al número de OC de la orden y,
 * si la encuentra, actualiza odoo_factura_id y odoo_factura_estado en la BD.
 * Devuelve null en modo demo.
 */
export async function sincronizarFacturaOdoo(
  ordenId: string,
): Promise<ResultadoSincronizacion | null> {
  if (isDemo()) return null;

  if (!odooConfigurado()) {
    return { ok: false, error: "Odoo no está configurado." };
  }

  const supabase = await createClient();

  // Obtener el número de OC de la orden.
  const { data: orden, error: errOrden } = await supabase
    .from("orden")
    .select("numero_oc")
    .eq("id", ordenId)
    .single();

  if (errOrden || !orden) {
    return { ok: false, error: "No se encontró la orden." };
  }

  const numeroOc: string = (orden as { numero_oc: string }).numero_oc;

  if (!numeroOc) {
    return { ok: false, error: "La orden no tiene número de OC." };
  }

  const factura = await buscarFactura(numeroOc);

  if (!factura) {
    return { ok: true }; // ok=true pero sin factura → "no encontrada"
  }

  // Guardar en la BD.
  const { error: errUpdate } = await supabase
    .from("orden")
    .update({
      odoo_factura_id: factura.id,
      odoo_factura_estado: factura.estado,
    })
    .eq("id", ordenId);

  if (errUpdate) {
    console.error("sincronizarFacturaOdoo: error al guardar:", errUpdate.message);
    return { ok: false, error: "Error al guardar la factura en la BD." };
  }

  revalidatePath(`/orden/${ordenId}`);

  return { ok: true, factura };
}
