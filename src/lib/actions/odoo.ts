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
  crearFlujoVenta,
  descubrirServidor,
  listarFacturasRecientes,
  leerFacturasPorId,
  type ResultadoConexion,
  type FacturaOdoo,
  type FacturaResumen,
  type FlujoVentaCreado,
  type LineaVenta,
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
 * Sincroniza la factura de la orden con Odoo (el de ESTA organización):
 * si ya hay una factura VINCULADA (odoo_factura_id) refresca su estado por
 * id; si no, intenta encontrarla por número de OC. Devuelve null en demo.
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
    .select("numero_oc, odoo_factura_id")
    .eq("id", ordenId)
    .eq("org_id", miembro.org_id)
    .single();

  if (errOrden || !orden) {
    return { ok: false, error: "No se encontró la orden." };
  }

  let factura: FacturaOdoo | null = null;
  if (orden.odoo_factura_id) {
    factura = (await leerFacturasPorId(config, [orden.odoo_factura_id])).get(orden.odoo_factura_id) ?? null;
    if (!factura) {
      return { ok: false, error: "La factura vinculada ya no existe en Odoo — vincula otra." };
    }
  } else {
    const numeroOc: string = (orden as { numero_oc: string }).numero_oc;
    if (!numeroOc) return { ok: false, error: "La orden no tiene número de OC." };
    factura = await buscarFactura(config, numeroOc);
    if (!factura) return { ok: true }; // ok=true pero sin factura → "no encontrada"
  }

  const { error: errUpdate } = await supabase
    .from("orden")
    .update({
      odoo_factura_id: factura.id,
      odoo_factura_estado: factura.estado,
      odoo_factura_nombre: factura.name,
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

// ── Crear el flujo de venta en Odoo desde la orden ───────────────────────────

/**
 * El botón «Crear en Odoo»: cliente + productos (se crean si faltan; los
 * físicos con serie) + orden de venta CONFIRMADA → Odoo genera el conduce.
 * Un clic reemplaza todo el tecleo manual; las series se ponen en Odoo al
 * validar el conduce, y la factura se vincula después (o la halla el cron).
 */
export async function crearFlujoOdoo(
  ordenId: string,
): Promise<{ ok: true; flujo: FlujoVentaCreado } | { ok: false; error: string } | null> {
  if (isDemo()) return null;
  const miembro = await getMiembro();
  if (!miembro) return { ok: false, error: "No autorizado." };
  const supabase = await createClient();
  const config = await obtenerConfigOdoo(supabase, miembro.org_id);
  if (!config) return { ok: false, error: "Odoo no está conectado — ve a Configuración → Integraciones." };

  const { data: orden } = await supabase
    .from("orden")
    .select("numero_oc, institucion, institucion_id, odoo_orden_id, odoo_orden_nombre")
    .eq("id", ordenId)
    .eq("org_id", miembro.org_id)
    .maybeSingle();
  if (!orden) return { ok: false, error: "No se encontró la orden." };
  if (orden.odoo_orden_id) {
    return { ok: false, error: `Esta orden ya está en Odoo (${orden.odoo_orden_nombre ?? orden.odoo_orden_id}).` };
  }
  if (!orden.institucion) return { ok: false, error: "La orden no tiene institución." };

  const { data: items } = await supabase
    .from("item")
    .select("nombre, tipo, cantidad, precio")
    .eq("orden_id", ordenId)
    .order("orden_indice", { ascending: true });
  if (!items?.length) return { ok: false, error: "La orden no tiene ítems que llevar a Odoo." };

  // El RNC de la institución, si está en el catálogo (para el cliente).
  let rnc: string | null = null;
  if (orden.institucion_id) {
    const { data: inst } = await supabase
      .from("institucion")
      .select("rnc")
      .eq("id", orden.institucion_id)
      .maybeSingle();
    rnc = inst?.rnc ?? null;
  }

  const lineas: LineaVenta[] = items.map((i) => ({
    nombre: i.nombre,
    tipo: (i.tipo ?? "licencia") as LineaVenta["tipo"],
    cantidad: Number(i.cantidad) || 1,
    // item.precio es el TOTAL del ítem en la OC → unitario para Odoo.
    precioUnitario:
      i.precio != null && Number(i.cantidad) > 0
        ? Math.round((Number(i.precio) / Number(i.cantidad)) * 100) / 100
        : null,
  }));

  const r = await crearFlujoVenta(config, {
    clienteNombre: orden.institucion,
    clienteRnc: rnc,
    referencia: orden.numero_oc ?? "",
    lineas,
  });
  if (!r.ok) return r;

  await supabase
    .from("orden")
    .update({ odoo_orden_id: r.flujo.ordenVentaId, odoo_orden_nombre: r.flujo.ordenVentaNombre })
    .eq("id", ordenId)
    .eq("org_id", miembro.org_id);

  const detalles = [
    r.flujo.clienteCreado ? "cliente creado" : null,
    r.flujo.productosCreados.length ? `productos creados: ${r.flujo.productosCreados.join(", ")}` : null,
    r.flujo.conduces.length ? `conduce ${r.flujo.conduces.join(", ")}` : null,
  ].filter(Boolean);
  await supabase.from("bitacora").insert({
    orden_id: ordenId,
    autor_id: miembro.user_id,
    tipo: "evento",
    texto: `Creada en Odoo la orden de venta ${r.flujo.ordenVentaNombre}${detalles.length ? ` (${detalles.join("; ")})` : ""}`,
  });

  revalidatePath(`/orden/${ordenId}`);
  return r;
}

// ── Vincular a mano (cuando las facturas no llevan el número de OC) ──────────

/** Las facturas recientes del Odoo de la org, para elegir cuál es la de la orden. */
export async function listarFacturasOdoo(): Promise<
  { ok: true; facturas: FacturaResumen[] } | { ok: false; error: string }
> {
  const miembro = await getMiembro();
  if (!miembro) return { ok: false, error: "No autorizado." };
  const supabase = await createClient();
  const config = await obtenerConfigOdoo(supabase, miembro.org_id);
  if (!config) return { ok: false, error: "Odoo no está conectado." };
  const facturas = await listarFacturasRecientes(config, 15);
  return { ok: true, facturas };
}

/** Vincula ESA factura de Odoo a la orden; el cron le sigue el pago solo. */
export async function vincularFacturaOdoo(
  ordenId: string,
  facturaId: number,
): Promise<ResultadoSincronizacion | null> {
  if (isDemo()) return null;
  const miembro = await getMiembro();
  if (!miembro) return { ok: false, error: "No autorizado." };
  const supabase = await createClient();
  const config = await obtenerConfigOdoo(supabase, miembro.org_id);
  if (!config) return { ok: false, error: "Odoo no está conectado." };

  const factura = (await leerFacturasPorId(config, [facturaId])).get(facturaId) ?? null;
  if (!factura) return { ok: false, error: "Esa factura no existe en Odoo." };

  const { error } = await supabase
    .from("orden")
    .update({
      odoo_factura_id: factura.id,
      odoo_factura_estado: factura.estado,
      odoo_factura_nombre: factura.name,
    })
    .eq("id", ordenId)
    .eq("org_id", miembro.org_id);
  if (error) return { ok: false, error: `No se pudo guardar: ${error.message}` };

  await supabase.from("bitacora").insert({
    orden_id: ordenId,
    autor_id: miembro.user_id,
    tipo: "evento",
    texto: `Factura de Odoo vinculada: ${factura.name} (${factura.montoTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })})`,
  });

  revalidatePath(`/orden/${ordenId}`);
  return { ok: true, factura };
}
