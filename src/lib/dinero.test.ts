import { describe, expect, it } from "vitest";
import { dondeEstaElDinero, porInstitucion } from "./dinero";
import { desdeEstado, formatCorto, type Estado, type Orden } from "./types";

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

const h = (...pares: [Estado, string][]) =>
  pares.map(([estado, desde]) => ({ estado, desde }));

describe("desdeEstado", () => {
  it("da el inicio de la racha vigente y no se deja engañar por cerrar después de cobrar", () => {
    const o = orden({
      estado: "cerrado",
      monto: 1,
      hist: h(
        ["orden_recibida", "2026-01-01T00:00:00Z"],
        ["facturado", "2026-02-01T00:00:00Z"],
        ["cobrado", "2026-03-01T00:00:00Z"],
        ["cerrado", "2026-04-01T00:00:00Z"],
      ),
    });
    expect(desdeEstado(o, ["cobrado", "cerrado"])).toBe("2026-03-01T00:00:00Z");
    expect(desdeEstado(o, ["facturado", "libramiento"])).toBeNull(); // ya salió de ahí
  });

  it("si vuelve atrás y entra otra vez, cuenta la vuelta; sin historial, null", () => {
    const o = orden({
      estado: "facturado",
      monto: 1,
      hist: h(
        ["facturado", "2026-02-01T00:00:00Z"],
        ["entregado", "2026-02-10T00:00:00Z"],
        ["facturado", "2026-03-01T00:00:00Z"],
      ),
    });
    expect(desdeEstado(o, ["facturado"])).toBe("2026-03-01T00:00:00Z");
    expect(desdeEstado(orden({ estado: "facturado", monto: 1 }), ["facturado"])).toBeNull();
  });
});

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
      { hoy: HOY },
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

  it("cuenta las vencidas y cuánto lleva esperando la más vieja, con historial si lo hay", () => {
    const d = dondeEstaElDinero(
      [
        orden({ estado: "en_coordinacion", monto: 1, plazo_entrega: "2026-10-01" }),
        orden({ estado: "en_coordinacion", monto: 1, plazo_entrega: "2026-12-01" }),
        // Sin historial: cuenta desde el último cambio.
        orden({ estado: "entregado", monto: 1, updated_at: "2026-09-01T00:00:00Z" }),
        // Con historial: cuenta desde que ENTRÓ en el tramo, no desde la última edición.
        orden({
          estado: "entregado",
          monto: 1,
          updated_at: "2026-10-12T00:00:00Z",
          hist: h(["orden_recibida", "2026-07-01T00:00:00Z"], ["entregado", "2026-08-14T00:00:00Z"]),
        }),
      ],
      { hoy: HOY },
    );
    const por = Object.fromEntries(d.tramos.map((t) => [t.key, t]));
    expect(por.por_entregar.vencidas).toBe(1);
    expect(por.sin_facturar.esperaMax).toBe(60); // 14-08 → 13-10
  });

  it("separa lo cobrado del mes y del año, compara con el mismo periodo anterior y mide la meta", () => {
    const d = dondeEstaElDinero(
      [
        // Cobrada con historial: la fecha de cobro es la del historial, no updated_at.
        orden({
          estado: "cerrado",
          monto: 100,
          updated_at: "2026-10-12T00:00:00Z",
          hist: h(["facturado", "2026-09-01T00:00:00Z"], ["cobrado", "2026-10-02T00:00:00Z"], ["cerrado", "2026-10-12T00:00:00Z"]),
        }),
        orden({ estado: "cerrado", monto: 50, updated_at: "2026-08-20T00:00:00Z" }),
        // Año pasado, dentro del mismo periodo (hasta el 13-10).
        orden({ estado: "cobrado", monto: 40, updated_at: "2025-10-01T00:00:00Z", fecha_oc: "2025-09-01" }),
        // Año pasado, FUERA del periodo (después del 13-10): no compara.
        orden({ estado: "cobrado", monto: 7, updated_at: "2025-12-31T00:00:00Z", fecha_oc: "2025-12-01" }),
        orden({ estado: "orden_recibida", monto: 1000, fecha_oc: "2026-10-05" }),
        orden({ estado: "orden_recibida", monto: 1, fecha_oc: null, created_at: "2026-05-05T00:00:00Z" }),
      ],
      { hoy: HOY, metaAnual: 2_000 },
    );
    expect(d.cobradoMes).toBe(100);
    expect(d.cobradoMesN).toBe(1);
    expect(d.cobradoAnio.monto).toBe(150);
    expect(d.cobradoAnio.anterior).toBe(40);
    expect(d.cobradoAnio.variacionPct).toBe(275);
    expect(d.generadoAnio.monto).toBe(1_151); // 100 + 50 + 1000 + 1
    expect(d.generadoAnio.anterior).toBe(40);
    expect(d.metaAnual).toBe(2_000);
    expect(d.metaPct).toBe(58);
    expect(d.meses.map((m) => m.clave)).toEqual([
      "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
    ]);
    expect(d.meses[5].label).toBe("oct");
    expect(d.meses[5].cobrado).toBe(100);
    expect(d.meses[3].cobrado).toBe(50);
    // Sin fecha de OC, cuenta por la fecha de creación.
    expect(d.meses[0].generadoN).toBe(1);
  });

  it("sin año anterior ni meta, no inventa comparaciones", () => {
    const d = dondeEstaElDinero([orden({ estado: "cobrado", monto: 10 })], { hoy: HOY });
    expect(d.cobradoAnio.variacionPct).toBeNull();
    expect(d.metaPct).toBeNull();
  });
});

describe("porInstitucion", () => {
  it("agrupa por institución (sin importar acentos o mayúsculas), ordena por lo que deben y mide cuánto tardan en pagar", () => {
    const filas = porInstitucion(
      [
        orden({
          institucion: "INTRANT",
          estado: "libramiento",
          monto: 500,
          hist: h(["facturado", "2026-08-14T00:00:00Z"], ["libramiento", "2026-09-20T00:00:00Z"]),
        }),
        orden({ institucion: "intrant", estado: "entregado", monto: 200 }),
        // Cobrada con las dos fechas: 30 días de factura a cobro.
        orden({
          institucion: "INTRANT",
          estado: "cobrado",
          monto: 1,
          hist: h(["facturado", "2026-01-01T00:00:00Z"], ["cobrado", "2026-01-31T00:00:00Z"]),
        }),
        // Cobrada sin historial: no cuenta para la mediana.
        orden({ institucion: "INTRANT", estado: "cobrado", monto: 1 }),
        orden({ institucion: "Ministerio de Hacienda", estado: "facturado", monto: 900, updated_at: "2026-10-01T00:00:00Z" }),
        orden({ institucion: "INABIE", estado: "orden_recibida", monto: 50 }),
        // Solo cobradas: no aparece.
        orden({ institucion: "MINERD", estado: "cobrado", monto: 99 }),
      ],
      HOY,
    );
    expect(filas.map((f) => f.institucion)).toEqual(["Ministerio de Hacienda", "INTRANT", "INABIE"]);
    const intrant = filas[1];
    expect(intrant.porCobrar).toBe(500);
    expect(intrant.sinFacturar).toBe(200);
    expect(intrant.esperaMax).toBe(60); // desde la factura (14-08), no desde el libramiento
    expect(intrant.pagaEnDias).toBe(30);
    expect(intrant.pagosMedidos).toBe(1);
    const hacienda = filas[0];
    expect(hacienda.esperaMax).toBe(12); // sin historial: desde el último cambio
    expect(hacienda.pagaEnDias).toBeNull();
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
