// El cotizador: del costo del distribuidor (USD) al precio ofertado (DOP).
//
//   precio_unitario = redondear2( costo_usd × tasa × factor(margen) )
//     markup : factor = 1 + margen/100          (costo × 1.30)
//     margen : factor = 1 / (1 − margen/100)    (costo ÷ 0.70 — el 30% de la
//                                                VENTA queda como ganancia)
//
// Módulo PURO, usado idéntico en cliente (vista previa en vivo) y servidor
// (al persistir la línea): el número de la pantalla y el del paquete son el
// mismo por construcción. El redondeo es del UNITARIO a 2 decimales — así
// unitario × cantidad cuadra exactamente con el subtotal impreso.
//
// Los valores calculados se CONGELAN en la línea al cotizar (snapshot).
// Cambiar la tasa del proceso después no reescribe líneas: recalcular es un
// acto explícito del usuario.

import type { EmpresaPerfil, LicItem, LicProceso } from "./tipos";

export type MargenModo = "markup" | "margen";

export interface ParamsCotizacion {
  tasa: number | null; // USD → DOP; null = no configurada (no se puede cotizar)
  margenPct: number;
  margenModo: MargenModo;
  itbisPct: number;
}

export function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function factorMargen(pct: number, modo: MargenModo): number {
  if (modo === "margen") {
    if (pct >= 100) return NaN; // margen del 100% de la venta no existe
    return 1 / (1 - pct / 100);
  }
  return 1 + pct / 100;
}

// Cascada de herencia: proceso → empresa → default.
export function paramsCotizacion(
  proceso: Pick<LicProceso, "tasa_usd_dop" | "margen_pct" | "itbis_pct">,
  perfil: Pick<
    EmpresaPerfil,
    "tasa_usd_dop" | "margen_pct" | "margen_modo" | "itbis_pct"
  > | null,
): ParamsCotizacion {
  return {
    tasa: proceso.tasa_usd_dop ?? perfil?.tasa_usd_dop ?? null,
    margenPct: proceso.margen_pct ?? perfil?.margen_pct ?? 30,
    margenModo: perfil?.margen_modo ?? "markup",
    itbisPct: proceso.itbis_pct ?? perfil?.itbis_pct ?? 18,
  };
}

// Precio de venta unitario en DOP (sin ITBIS) desde el costo del catálogo.
export function precioVentaUnitario(
  costoUsd: number,
  p: ParamsCotizacion,
): number | null {
  if (p.tasa === null || p.tasa <= 0 || costoUsd <= 0) return null;
  const factor = factorMargen(p.margenPct, p.margenModo);
  if (!Number.isFinite(factor)) return null;
  return redondear2(costoUsd * p.tasa * factor);
}

export interface Totales {
  subtotal: number;
  itbis: number;
  total: number;
}

// Cómo viene el ITBIS en el precio tecleado (estilo Odoo):
//   'mas'      → el precio es la BASE; el ITBIS se suma encima (default)
//   'incluido' → el precio YA trae el ITBIS; la base se despeja (÷ 1.18)
//   'exento'   → la línea no lleva ITBIS (licencias/intangibles, Dec. 293-11)
export type ItbisModo = "mas" | "incluido" | "exento";

// La BASE unitaria (sin ITBIS) — lo que imprime el F.033 y suma el subtotal.
export function precioBaseUnitario(
  precio: number,
  modo: ItbisModo,
  itbisPct: number,
): number {
  if (modo === "incluido") return redondear2(precio / (1 + itbisPct / 100));
  return precio;
}

export function totalesItem(
  item: Pick<LicItem, "precio_unitario" | "cantidad" | "itbis_modo">,
  itbisPct: number,
): Totales | null {
  if (item.precio_unitario === null) return null;
  const base = precioBaseUnitario(item.precio_unitario, item.itbis_modo, itbisPct);
  const subtotal = redondear2(base * item.cantidad);
  const itbis =
    item.itbis_modo === "exento" ? 0 : redondear2((subtotal * itbisPct) / 100);
  return { subtotal, itbis, total: redondear2(subtotal + itbis) };
}

// Suma solo los ítems ofertados y con precio.
export function totalesProceso(
  items: Pick<
    LicItem,
    "precio_unitario" | "cantidad" | "itbis_modo" | "ofertamos"
  >[],
  itbisPct: number,
): Totales {
  return items
    .filter((i) => i.ofertamos)
    .reduce(
      (acc, i) => {
        const t = totalesItem(i, itbisPct);
        if (!t) return acc;
        return {
          subtotal: redondear2(acc.subtotal + t.subtotal),
          itbis: redondear2(acc.itbis + t.itbis),
          total: redondear2(acc.total + t.total),
        };
      },
      { subtotal: 0, itbis: 0, total: 0 },
    );
}
