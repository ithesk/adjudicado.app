import { describe, expect, it } from "vitest";
import { dondeEstaElDinero } from "./dinero";
import { formatCorto, type Estado, type Orden } from "./types";

const HOY = new Date(2026, 9, 13, 12, 0, 0); // 13-10-2026 (mes 9 = octubre)

function orden(p: Partial<Orden> & { estado: Estado; monto: number }): Orden {
  return {
    id: Math.random().toString(36).slice(2),
    org_id: "org",
    numero_oc: null,
    institucion: null,
    codigo_expediente: null,
    moneda: "DOP",
    fecha_oc: "2026-10-01",
    plazo_entrega: null,
    suplidor: null,
    suplidor_estado: null,
    suplidor_fecha_estim: null,
    metodo_pago: null,
    plazo_pago_dias: null,
    responsable_id: null,
    etiquetas: [],
    oc_archivo_url: null,
    ocr_raw: null,
    creado_por: null,
    created_at: "2026-10-01T12:00:00Z",
    updated_at: "2026-10-10T12:00:00Z",
    ...p,
  };
}

describe("dondeEstaElDinero", () => {
  it("reparte el dinero vivo por fase y calcula el porcentaje", () => {
    const d = dondeEstaElDinero(
      [
        orden({ estado: "orden_recibida", monto: 100 }),
        orden({ estado: "en_coordinacion", monto: 100 }),
        orden({ estado: "entregado", monto: 300 }),
        orden({ estado: "libramiento", monto: 500 }),
        orden({ estado: "cobrado", monto: 9_000 }), // no es vivo
      ],
      HOY,
    );
    expect(d.totalVivo).toBe(1000);
    expect(d.vivasN).toBe(4);
    const por = Object.fromEntries(d.tramos.map((t) => [t.key, t]));
    expect(por.por_entregar.n).toBe(2);
    expect(por.por_entregar.monto).toBe(200);
    expect(por.por_entregar.pct).toBe(20);
    expect(por.sin_facturar.monto).toBe(300);
    expect(por.facturado.n).toBe(0);
    expect(por.facturado.esperaMax).toBeNull();
    expect(por.libramiento.pct).toBe(50);
  });

  it("cuenta las vencidas y cuánto lleva esperando la más vieja", () => {
    const d = dondeEstaElDinero(
      [
        orden({ estado: "en_coordinacion", monto: 1, plazo_entrega: "2026-10-01" }),
        orden({ estado: "en_coordinacion", monto: 1, plazo_entrega: "2026-12-01" }),
        orden({ estado: "entregado", monto: 1, updated_at: "2026-09-01T00:00:00Z" }),
        orden({ estado: "entregado", monto: 1, updated_at: "2026-10-12T00:00:00Z" }),
      ],
      HOY,
    );
    const por = Object.fromEntries(d.tramos.map((t) => [t.key, t]));
    expect(por.por_entregar.vencidas).toBe(1);
    expect(por.sin_facturar.esperaMax).toBe(42);
  });

  it("separa lo cobrado del mes y del año, y lo generado por mes", () => {
    const d = dondeEstaElDinero(
      [
        orden({ estado: "cobrado", monto: 100, updated_at: "2026-10-02T00:00:00Z" }),
        orden({ estado: "cerrado", monto: 50, updated_at: "2026-08-20T00:00:00Z" }),
        orden({ estado: "cobrado", monto: 7, updated_at: "2025-12-31T00:00:00Z" }),
        orden({ estado: "orden_recibida", monto: 1000, fecha_oc: "2026-10-05" }),
        orden({ estado: "orden_recibida", monto: 1, fecha_oc: null, created_at: "2026-05-05T00:00:00Z" }),
      ],
      HOY,
    );
    expect(d.cobradoMes).toBe(100);
    expect(d.cobradoMesN).toBe(1);
    expect(d.cobradoAnio).toBe(150);
    expect(d.generadoAnio).toBe(1_158); // 100 + 50 + 1000 + 1 + 7 (fecha_oc por defecto en 2026)
    expect(d.meses.map((m) => m.clave)).toEqual([
      "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
    ]);
    expect(d.meses[5].label).toBe("oct");
    expect(d.meses[5].cobrado).toBe(100);
    expect(d.meses[3].cobrado).toBe(50);
    // Sin fecha de OC, cuenta por la fecha de creación.
    expect(d.meses[0].generadoN).toBe(1);
  });
});

describe("formatCorto", () => {
  it("compacta millones, miles y deja lo chico entero", () => {
    // es-DO separa decimales con punto, como formatRD.
    expect(formatCorto(1_234_567)).toBe("RD$1.23 MM");
    expect(formatCorto(436_000)).toBe("RD$436 mil");
    expect(formatCorto(950)).toBe("RD$950");
    expect(formatCorto(0)).toBe("RD$0");
    expect(formatCorto(15_460, "USD")).toBe("US$15 mil");
  });
});
