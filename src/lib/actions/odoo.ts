"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMiembro } from "@/lib/auth";
import { isDemo } from "@/lib/demo";
import { cifrar } from "@/lib/cifrado";
import { obtenerConfigOdoo } from "@/lib/odoo-config";
import {
  probarConexion,
  buscarFactura,
  descubrirServidor,
  type ResultadoConexion,
  type FacturaOdoo,
  type ServidorOdoo,
} from "@/lib/odoo";

// ── Paso 1 del conectar: con la URL sola, descubrir versión y bases ──────────

export async function detectarOdoo(
  url: string,
): Promise<{ ok: true; servidor: ServidorOdoo; url: string } | { ok: false; error: string }> {
  const miembro = await getMiembro();
  if (!miembro) return { ok: false, error: "No autorizado." };
  let limpia = url.trim().replace(/\/+$/, "");
  if (!limpia) return { ok: false, error: "Pon la URL de tu Odoo." };
  if (!/^https?:\/\//.test(limpia)) limpia = `https://${limpia}`;
  const r = await descubrirServidor(limpia);
  return r.ok ? { ...r, url: limpia } : r;
}

// ── Conectar / desconectar la cuenta de Odoo de ESTA organización ────────────

/**
 * El flujo del botón «Conectar con Odoo»: valida las credenciales CONTRA el
 * servidor ANTES de guardar — si no autentican, no se guarda nada. La API
 * key se cifra en reposo y nunca vuelve al navegador.
 */
export async function conectarOdoo(datos: {
  url: string;
  db: string;
  usuario: string;
  apiKey: string;
}): Promise<ResultadoConexion> {
  if (isDemo()) return { ok: false, error: "En modo demo no se guardan cambios." };
  const miembro = await getMiembro();
  if (!miembro) return { ok: false, error: "No autorizado." };

  const url = datos.url.trim().replace(/\/+$/, "");
  const db = datos.db.trim();
  const usuario = datos.usuario.trim();
  const apiKey = datos.apiKey.trim();
  if (!url || !db || !usuario || !apiKey) {
    return { ok: false, error: "Completa los cuatro campos." };
  }
  if (!/^https?:\/\//.test(url)) {
    return { ok: false, error: "La URL debe empezar con http:// o https://." };
  }

  const prueba = await probarConexion({ url, db, usuario, apiKey });
  if (!prueba.ok) return prueba; // el error de Odoo, tal cual, sin guardar

  const supabase = await createClient();
  const { error } = await supabase.from("integracion_odoo").upsert({
    org_id: miembro.org_id,
    url,
    db,
    usuario,
    api_key_cifrada: cifrar(apiKey),
    activo: true,
    version: prueba.version ?? null,
    probado_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: `Conectó, pero no se pudo guardar: ${error.message}` };

  revalidatePath("/configuracion/integraciones");
  return prueba;
}

export async function desconectarOdoo(): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("integracion_odoo")
    .delete()
    .eq("org_id", miembro.org_id);
  revalidatePath("/configuracion/integraciones");
  return error ? `No se pudo desconectar: ${error.message}` : null;
}

// ── Probar conexión (con lo ya guardado) ─────────────────────────────────────

/** Prueba la conexión de la org actual y deja el resultado anotado. */
export async function probarOdoo(): Promise<ResultadoConexion> {
  const miembro = await getMiembro();
  if (!miembro) return { ok: false, error: "No autorizado." };
  const supabase = await createClient();

  const config = await obtenerConfigOdoo(supabase, miembro.org_id);
  if (!config) return { ok: false, error: "Odoo no está conectado." };

  const resultado = await probarConexion(config);
  // Si la conexión viene de la cuenta guardada, anotar la prueba.
  await supabase
    .from("integracion_odoo")
    .update({
      version: resultado.ok ? resultado.version ?? null : null,
      probado_at: new Date().toISOString(),
    })
    .eq("org_id", miembro.org_id);
  revalidatePath("/configuracion/integraciones");
  return resultado;
}

// ── Sincronizar factura de una orden con Odoo ────────────────────────────────

export interface ResultadoSincronizacion {
  ok: boolean;
  factura?: FacturaOdoo;
  error?: string;
}

/**
 * Busca en Odoo (el de ESTA organización) la factura asociada al número de
 * OC de la orden y, si la encuentra, guarda odoo_factura_id y estado.
 * Devuelve null en modo demo.
 */
export async function sincronizarFacturaOdoo(
  ordenId: string,
): Promise<ResultadoSincronizacion | null> {
  if (isDemo()) return null;
  const miembro = await getMiembro();
  if (!miembro) return { ok: false, error: "No autorizado." };

  const supabase = await createClient();
  const config = await obtenerConfigOdoo(supabase, miembro.org_id);
  if (!config) {
    return { ok: false, error: "Odoo no está conectado — ve a Configuración → Integraciones." };
  }

  const { data: orden, error: errOrden } = await supabase
    .from("orden")
    .select("numero_oc")
    .eq("id", ordenId)
    .eq("org_id", miembro.org_id)
    .single();

  if (errOrden || !orden) {
    return { ok: false, error: "No se encontró la orden." };
  }

  const numeroOc: string = (orden as { numero_oc: string }).numero_oc;
  if (!numeroOc) {
    return { ok: false, error: "La orden no tiene número de OC." };
  }

  const factura = await buscarFactura(config, numeroOc);
  if (!factura) {
    return { ok: true }; // ok=true pero sin factura → "no encontrada"
  }

  const { error: errUpdate } = await supabase
    .from("orden")
    .update({
      odoo_factura_id: factura.id,
      odoo_factura_estado: factura.estado,
    })
    .eq("id", ordenId)
    .eq("org_id", miembro.org_id);

  if (errUpdate) {
    console.error("sincronizarFacturaOdoo: error al guardar:", errUpdate.message);
    return { ok: false, error: "Error al guardar la factura en la BD." };
  }

  revalidatePath(`/orden/${ordenId}`);
  return { ok: true, factura };
}
