// CRON — Sincronización automática de facturas con Odoo, POR ORGANIZACIÓN.
//
// Para cada empresa con su cuenta de Odoo conectada (integracion_odoo) — y,
// en modo legado, las que aún dependen de las env ODOO_* — busca la factura
// de cada orden viva en fase de facturación (entregado → libramiento) y:
//   1. guarda id/estado de la factura si cambiaron;
//   2. deja constancia del cambio en la bitácora de la orden (evento);
//   3. avanza el estado de la orden cuando Odoo lo confirma:
//        listo_facturar → facturado  (la factura existe y está publicada)
//        facturado/libramiento → cobrado  (payment_state = paid)
//
// Una empresa con credenciales rotas no afecta a las demás. Programado en
// vercel.json; Vercel manda `Authorization: Bearer CRON_SECRET` solo.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { descifrar } from "@/lib/cifrado";
import { buscarFacturasLote, leerFacturasPorId, configDesdeEnv, type OdooConfig } from "@/lib/odoo";
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

type OrdenViva = {
  id: string;
  numero_oc: string | null;
  estado: Estado;
  odoo_factura_id: number | null;
  odoo_factura_estado: string | null;
};

const ESTADOS_FACTURABLES = ["entregado", "listo_facturar", "facturado", "libramiento"];

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Las cuentas conectadas por organización.
  const { data: cuentas, error: errCuentas } = await supabase
    .from("integracion_odoo")
    .select("org_id, url, db, usuario, api_key_cifrada")
    .eq("activo", true);
  if (errCuentas) {
    return NextResponse.json(
      { error: `No se pudieron leer las integraciones: ${errCuentas.message}` },
      { status: 500 },
    );
  }

  // Tandas: cada org con su config; y el modo legado (env) para las órdenes
  // de organizaciones SIN cuenta conectada — hasta que migren.
  const tandas: { etiqueta: string; config: OdooConfig; orgId: string | null }[] = [];
  for (const c of cuentas ?? []) {
    try {
      tandas.push({
        etiqueta: c.org_id,
        orgId: c.org_id,
        config: { url: c.url, db: c.db, usuario: c.usuario, apiKey: descifrar(c.api_key_cifrada) },
      });
    } catch {
      console.error(`cron odoo: no se pudo descifrar la API key de la org ${c.org_id} — saltada.`);
    }
  }
  const legado = configDesdeEnv();
  if (legado) tandas.push({ etiqueta: "legado-env", orgId: null, config: legado });

  if (tandas.length === 0) {
    return NextResponse.json({ ok: true, nota: "Ninguna organización tiene Odoo conectado." });
  }

  const orgsConCuenta = (cuentas ?? []).map((c) => c.org_id);
  let revisadas = 0;
  let conFactura = 0;
  let cambios = 0;
  let avanzadas = 0;

  for (const tanda of tandas) {
    // Las órdenes donde el estado de la factura importa (y hay OC que buscar).
    // (El builder tipado de supabase-js explota en profundidad al condicionar
    // filtros — el resultado se tipa a mano con OrdenViva más abajo.)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let filtro: any = supabase
      .from("orden")
      .select("id, numero_oc, estado, odoo_factura_id, odoo_factura_estado")
      .not("numero_oc", "is", null)
      .in("estado", ESTADOS_FACTURABLES);
    if (tanda.orgId) {
      filtro = filtro.eq("org_id", tanda.orgId);
    } else if (orgsConCuenta.length > 0) {
      // Modo legado: solo las órdenes de organizaciones SIN cuenta conectada.
      filtro = filtro.not("org_id", "in", `(${orgsConCuenta.join(",")})`);
    }
    const { data: ordenes, error } = (await filtro
      .order("updated_at", { ascending: false })
      .limit(60)) as { data: OrdenViva[] | null; error: { message: string } | null };
    if (error) {
      console.error(`cron odoo [${tanda.etiqueta}]: no se pudieron leer las órdenes:`, error.message);
      continue;
    }

    const vivas = (ordenes ?? []).filter((o) => o.numero_oc) as OrdenViva[];
    if (vivas.length === 0) continue;
    revisadas += vivas.length;

    // Las VINCULADAS se leen por id (una sola llamada, match exacto); el
    // resto intenta por número de OC (solo funciona si la factura lo lleva).
    const vinculadas = vivas.filter((o) => o.odoo_factura_id);
    const sueltas = vivas.filter((o) => !o.odoo_factura_id);
    const porId = await leerFacturasPorId(tanda.config, vinculadas.map((o) => o.odoo_factura_id as number));
    const porOc = await buscarFacturasLote(tanda.config, sueltas.map((o) => o.numero_oc as string));
    conFactura += porId.size + porOc.size;

    for (const orden of vivas) {
      const factura = orden.odoo_factura_id
        ? porId.get(orden.odoo_factura_id)
        : porOc.get(orden.numero_oc as string);
      if (!factura) continue;

      // 1) El estado de la factura cambió → guardar + bitácora.
      if (factura.estado !== orden.odoo_factura_estado) {
        const { error: errUpd } = await supabase
          .from("orden")
          .update({ odoo_factura_id: factura.id, odoo_factura_estado: factura.estado, odoo_factura_nombre: factura.name })
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
  }

  return NextResponse.json({
    ok: true,
    organizaciones: tandas.length,
    revisadas,
    conFactura,
    cambios,
    avanzadas,
  });
}
