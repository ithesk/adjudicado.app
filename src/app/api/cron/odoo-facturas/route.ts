// CRON — Sincronización automática de facturas con Odoo.
//
// Lo que antes era un botón manual en cada orden, ahora corre solo: para
// cada orden VIVA en fase de facturación (entregado → libramiento) busca su
// factura en Odoo por número de OC y:
//   1. guarda id/estado de la factura si cambiaron;
//   2. deja constancia del cambio en la bitácora de la orden (evento);
//   3. avanza el estado de la orden cuando Odoo lo confirma:
//        listo_facturar → facturado  (la factura existe y está publicada)
//        facturado/libramiento → cobrado  (payment_state = paid)
//
// Programado en vercel.json. Vercel manda `Authorization: Bearer CRON_SECRET`
// automáticamente cuando la variable está definida — sin ella, 401.
// Corre con el cliente admin (no hay sesión de usuario en un cron); el
// universo de órdenes es el mismo que ve el botón manual (Odoo es una sola
// cuenta global por env vars — si algún día hay credenciales por org, este
// cron se acota por org junto con ellas).

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarFacturasLote, odooConfigurado } from "@/lib/odoo";
import type { Estado } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// Cómo se lee un estado de pago de Odoo en cristiano (para la bitácora).
const ESTADO_FACTURA: Record<string, string> = {
  draft: "en borrador",
  not_paid: "publicada, sin pagar",
  in_payment: "en proceso de pago",
  partial: "pagada parcialmente",
  paid: "PAGADA",
  reversed: "revertida",
};

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!odooConfigurado()) {
    return NextResponse.json({ ok: true, nota: "Odoo no está configurado — nada que hacer." });
  }

  const supabase = createAdminClient();

  // Las órdenes donde el estado de la factura importa (y hay OC que buscar).
  const { data: ordenes, error } = await supabase
    .from("orden")
    .select("id, numero_oc, estado, odoo_factura_estado")
    .not("numero_oc", "is", null)
    .in("estado", ["entregado", "listo_facturar", "facturado", "libramiento"])
    .order("updated_at", { ascending: false })
    .limit(60);
  if (error) {
    return NextResponse.json({ error: `No se pudieron leer las órdenes: ${error.message}` }, { status: 500 });
  }

  const vivas = (ordenes ?? []).filter((o) => o.numero_oc);
  const facturas = await buscarFacturasLote(vivas.map((o) => o.numero_oc as string));

  let cambios = 0;
  let avanzadas = 0;

  for (const orden of vivas) {
    const factura = facturas.get(orden.numero_oc as string);
    if (!factura) continue;

    // 1) El estado de la factura cambió → guardar + bitácora.
    if (factura.estado !== orden.odoo_factura_estado) {
      const { error: errUpd } = await supabase
        .from("orden")
        .update({ odoo_factura_id: factura.id, odoo_factura_estado: factura.estado })
        .eq("id", orden.id);
      if (errUpd) {
        console.error(`cron odoo: no se pudo guardar la orden ${orden.id}:`, errUpd.message);
        continue;
      }
      cambios += 1;
      const legible = ESTADO_FACTURA[factura.estado] ?? factura.estado;
      const pendiente =
        factura.residual > 0 && factura.estado !== "paid"
          ? ` — pendiente ${factura.residual.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
          : "";
      await supabase.from("bitacora").insert({
        orden_id: orden.id,
        autor_id: null,
        tipo: "evento",
        texto: `Odoo: la factura ${factura.name} está ${legible}${pendiente}`,
      });
    }

    // 2) Avance de estado cuando Odoo lo confirma.
    let nuevoEstado: Estado | null = null;
    if (orden.estado === "listo_facturar" && factura.estado !== "draft") {
      nuevoEstado = "facturado";
    } else if (
      (orden.estado === "facturado" || orden.estado === "libramiento") &&
      factura.estado === "paid"
    ) {
      nuevoEstado = "cobrado";
    }
    if (nuevoEstado) {
      const { error: errEstado } = await supabase
        .from("orden")
        .update({ estado: nuevoEstado })
        .eq("id", orden.id)
        .eq("estado", orden.estado); // nadie la movió entre lectura y escritura
      if (!errEstado) {
        avanzadas += 1;
        await supabase.from("bitacora").insert({
          orden_id: orden.id,
          autor_id: null,
          tipo: "evento",
          texto:
            nuevoEstado === "cobrado"
              ? `Odoo confirma el pago de ${factura.name} — la orden pasa a Cobrado`
              : `Odoo tiene la factura ${factura.name} publicada — la orden pasa a Facturado`,
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    revisadas: vivas.length,
    conFactura: facturas.size,
    cambios,
    avanzadas,
  });
}
