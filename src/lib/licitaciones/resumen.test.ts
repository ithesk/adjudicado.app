import { describe, expect, it } from "vitest";
import { resumenLicitaciones } from "./resumen";
import type { EstadoLicitacion, LicProceso } from "./tipos";

const HOY = new Date(2026, 9, 13, 8, 0, 0); // 13-10-2026

let n = 0;
function proceso(p: Partial<LicProceso> & { estado: EstadoLicitacion }): LicProceso {
  n++;
  return {
    id: `p${n}`,
    org_id: "org",
    institucion_id: null,
    codigo: `X-CM-2026-${String(n).padStart(4, "0")}`,
    modalidad: "CM",
    objeto: null,
    moneda: "DOP",
    adjudicacion: "total",
    criterio: "menor_precio",
    plazo_pago_dias: null,
    cierre: null,
    tasa_usd_dop: null,
    margen_pct: null,
    itbis_pct: null,
    notas: null,
    creado_por: null,
    created_at: "2026-10-01T12:00:00Z",
    updated_at: "2026-10-10T12:00:00Z",
    ...p,
  };
}

describe("resumenLicitaciones", () => {
  it("reparte los procesos por tramo con su dinero", () => {
    const ps = [
      proceso({ estado: "costeo" }), // p1, sin cotizar
      proceso({ estado: "listo" }), // p2
      proceso({ estado: "sometido" }), // p3
      proceso({ estado: "subsanacion" }), // p4
      proceso({ estado: "adjudicado" }), // p5
      proceso({ estado: "adjudicado", updated_at: "2025-11-02T00:00:00Z" }), // p6, del año pasado
      proceso({ estado: "perdido" }), // p7
      proceso({ estado: "descartado" }), // p8
    ];
    const r = resumenLicitaciones({
      procesos: ps,
      montos: { p2: 300, p3: 1000, p4: 500, p5: 2000, p6: 7000, p7: 100 },
      subsanaciones: {},
      hoy: HOY,
    });
    expect(r.enTrabajo).toEqual({ n: 2, monto: 300, conMonto: 1 });
    expect(r.listas).toBe(1);
    expect(r.enJuego).toEqual({ n: 2, monto: 1500, conMonto: 2 });
    expect(r.subsanacion).toBe(1);
    expect(r.adjudicadas).toEqual({ n: 2, monto: 9000, conMonto: 2 });
    expect(r.adjudicadasAnio).toEqual({ n: 1, monto: 2000, conMonto: 1 });
    expect(r.perdidas).toBe(1);
    expect(r.decididas).toBe(3);
    expect(r.tasaExito).toBe(67);
    // Descartados, adjudicados y perdidos no son "vivos".
    expect(r.vivos.map((v) => v.id)).toEqual(expect.arrayContaining(["p1", "p2", "p3", "p4"]));
    expect(r.vivos).toHaveLength(4);
  });

  it("ordena los vivos por el reloj: la subsanación manda y lo sometido sin reloj va al final", () => {
    const ps = [
      proceso({ estado: "costeo", cierre: "2026-10-20T15:00:00Z" }), // p1: 7 d
      proceso({ estado: "sometido", cierre: "2026-10-01T15:00:00Z" }), // p2: sin reloj
      proceso({ estado: "subsanacion", cierre: "2026-10-01T15:00:00Z" }), // p3: subsanación mañana
      proceso({ estado: "armado", cierre: "2026-10-13T15:00:00Z" }), // p4: hoy
    ];
    const r = resumenLicitaciones({
      procesos: ps,
      montos: {},
      subsanaciones: { [ps[2].id]: "2026-10-14" },
      hoy: HOY,
    });
    expect(r.vivos.map((v) => v.id)).toEqual([ps[3].id, ps[2].id, ps[0].id, ps[1].id]);
    expect(r.vivos[0].dias).toBe(0);
    expect(r.vivos[1].subsanacion).toBe("2026-10-14");
    expect(r.vivos[3].dias).toBeNull();
  });

  it("sin decididas no inventa una tasa", () => {
    const r = resumenLicitaciones({
      procesos: [proceso({ estado: "captura" })],
      montos: {},
      subsanaciones: {},
      hoy: HOY,
    });
    expect(r.tasaExito).toBeNull();
    expect(r.decididas).toBe(0);
  });
});
