import { describe, it, expect } from "vitest";
import {
  factorMargen,
  paramsCotizacion,
  precioVentaUnitario,
  totalesItem,
  totalesProceso,
} from "./cotizador";

describe("cotizador", () => {
  const params = {
    tasa: 61.5,
    margenPct: 30,
    margenModo: "markup" as const,
    itbisPct: 18,
  };

  it("markup: costo × 1.30 — US$1,000 → RD$79,950.00", () => {
    expect(precioVentaUnitario(1000, params)).toBe(79_950);
  });

  it("margen real: costo ÷ 0.70 — US$1,000 → RD$87,857.14 (los dos modos difieren)", () => {
    const p = { ...params, margenModo: "margen" as const };
    expect(precioVentaUnitario(1000, p)).toBe(87_857.14);
    expect(precioVentaUnitario(1000, p)).not.toBe(precioVentaUnitario(1000, params));
  });

  it("margen ≥ 100% de la venta no existe", () => {
    expect(factorMargen(100, "margen")).toBeNaN();
    expect(precioVentaUnitario(1000, { ...params, margenPct: 100, margenModo: "margen" })).toBeNull();
  });

  it("sin tasa configurada no se puede cotizar", () => {
    expect(precioVentaUnitario(1000, { ...params, tasa: null })).toBeNull();
  });

  it("el unitario se redondea a 2 decimales y unitario × cantidad cuadra con el subtotal", () => {
    // 1195 × 61.5 × 1.3 = 95,540.25 → exacto
    const unitario = precioVentaUnitario(1195, params)!;
    expect(unitario).toBe(95_540.25);
    const t = totalesItem(
      { precio_unitario: unitario, cantidad: 2, itbis_aplica: true },
      18,
    )!;
    expect(t.subtotal).toBe(191_080.5);
    expect(t.itbis).toBe(34_394.49);
    expect(t.total).toBe(225_474.99);
  });

  it("un ítem exento no lleva ITBIS", () => {
    const t = totalesItem(
      { precio_unitario: 100, cantidad: 1, itbis_aplica: false },
      18,
    )!;
    expect(t.itbis).toBe(0);
    expect(t.total).toBe(100);
  });

  it("los totales del proceso ignoran ítems descartados y sin precio", () => {
    const t = totalesProceso(
      [
        { precio_unitario: 100, cantidad: 2, itbis_aplica: true, ofertamos: true },
        { precio_unitario: 999, cantidad: 1, itbis_aplica: true, ofertamos: false }, // descartado
        { precio_unitario: null, cantidad: 1, itbis_aplica: true, ofertamos: true }, // sin cotizar
      ],
      18,
    );
    expect(t.subtotal).toBe(200);
    expect(t.itbis).toBe(36);
    expect(t.total).toBe(236);
  });

  it("la cascada hereda proceso → empresa → default", () => {
    const perfil = {
      tasa_usd_dop: 60,
      margen_pct: 25,
      margen_modo: "margen" as const,
      itbis_pct: 18,
    };
    // El proceso pisa la tasa; el margen viene de la empresa.
    const p = paramsCotizacion(
      { tasa_usd_dop: 62, margen_pct: null, itbis_pct: null },
      perfil,
    );
    expect(p).toEqual({ tasa: 62, margenPct: 25, margenModo: "margen", itbisPct: 18 });
    // Sin perfil: defaults.
    const q = paramsCotizacion(
      { tasa_usd_dop: null, margen_pct: null, itbis_pct: null },
      null,
    );
    expect(q).toEqual({ tasa: null, margenPct: 30, margenModo: "markup", itbisPct: 18 });
  });
});
