import { describe, expect, it } from "vitest";
import type { DgcpProceso } from "./api";
import { diasHasta, evaluar, horaRd, modalidadDesdeDgcp, radar, siglasDesdeCodigo } from "./relevancia";

const AHORA = new Date("2026-10-06T12:00:00Z");

function proc(p: Partial<DgcpProceso>): DgcpProceso {
  return {
    codigo_proceso: "X-DAF-CM-2026-0001",
    unidad_compra: "Ministerio X",
    modalidad: "Compras Menores",
    titulo: "",
    descripcion: null,
    estado_proceso: "Proceso publicado",
    divisa: "DOP",
    monto_estimado: null,
    fecha_publicacion: null,
    fecha_fin_recepcion_ofertas: "2026-10-20T10:00:00Z",
    fecha_apertura_ofertas: null,
    fecha_estimada_adjudicacion: null,
    dirigido_mipymes: "No",
    dirigido_mipymes_mujeres: "No",
    proceso_lotificado: "No",
    objeto_proceso: null,
    url: null,
    ...p,
  };
}

describe("evaluar", () => {
  it("un socio de la empresa es relevancia alta", () => {
    const o = evaluar(proc({ titulo: "Renovación de licencias Adobe Creative Cloud" }), {
      socios: ["adobe"],
      ahora: AHORA,
    });
    expect(o?.nivel).toBe("alta");
    expect(o?.socios).toEqual(["adobe"]);
  });

  it("ignora tildes y mayúsculas", () => {
    const o = evaluar(proc({ titulo: "ADQUISICIÓN DE CÁMARA FOTOGRÁFICA" }), { socios: [], ahora: AHORA });
    expect(o?.nivel).toBe("media");
  });

  it("'ups' no salta con 'grupos'", () => {
    expect(evaluar(proc({ titulo: "Alquiler de salón para grupos" }), { socios: [], ahora: AHORA })).toBeNull();
    expect(evaluar(proc({ titulo: "Compra de UPS 3KVA" }), { socios: [], ahora: AHORA })).not.toBeNull();
  });

  it("descarta falsos positivos salvo que nombre un socio", () => {
    expect(
      evaluar(proc({ titulo: "Cartuchos para gases industriales" }), { socios: [], ahora: AHORA }),
    ).toBeNull();
  });

  it("descarta los ya cerrados", () => {
    expect(
      evaluar(proc({ titulo: "Laptops", fecha_fin_recepcion_ofertas: "2026-10-01T10:00:00Z" }), {
        socios: [],
        ahora: AHORA,
      }),
    ).toBeNull();
  });

  it("con texto de búsqueda pasa todo lo que lo contenga", () => {
    const o = evaluar(proc({ titulo: "Mantenimiento de cisternas" }), {
      socios: [],
      texto: "cisternas",
      ahora: AHORA,
    });
    expect(o?.nivel).toBe("explorar");
  });
});

describe("radar", () => {
  it("ordena por urgencia antes que por valor", () => {
    const r = radar(
      [
        proc({ codigo_proceso: "A", titulo: "Laptops", monto_estimado: 5_000_000 }),
        proc({ codigo_proceso: "B", titulo: "Laptops", fecha_fin_recepcion_ofertas: "2026-10-07T15:00:00Z" }),
        proc({ codigo_proceso: "C", titulo: "Laptops", estado_proceso: "Proceso adjudicado y celebrado" }),
      ],
      { socios: [], ahora: AHORA },
    );
    expect(r.map((o) => o.codigo)).toEqual(["B", "A"]);
  });
});

describe("códigos", () => {
  it("modalidad desde el código o el texto", () => {
    expect(modalidadDesdeDgcp("INAPA-CCC-LPN-2026-0025", null)).toBe("LPN");
    expect(modalidadDesdeDgcp("MICM-DAF-CM-2026-0009", null)).toBe("CM");
    expect(modalidadDesdeDgcp("X-UC-2026-1", "Comparación de Precios")).toBe("CP");
  });
  it("siglas", () => {
    expect(siglasDesdeCodigo("OGTIC-CCC-CP-2026-0011")).toBe("OGTIC");
  });
});

describe("socios por sus productos", () => {
  it("FortiAIOps es Fortinet (MITUR-DAF-CM-2026-0106)", () => {
    const o = evaluar(
      proc({ titulo: "ADQUISICIÓN DE LAS LICENCIAS FORTIAIOPS Y RENOVACION DE LAS LICENCIAS SKETCHUP PRO" }),
      { socios: ["fortinet"], ahora: AHORA },
    );
    expect(o?.nivel).toBe("alta");
    expect(o?.socios).toEqual(["fortinet"]);
  });
  it("«fortificación» no es Fortinet", () => {
    expect(
      evaluar(proc({ titulo: "Fortificación de harina para comedores" }), { socios: ["fortinet"], ahora: AHORA }),
    ).toBeNull();
  });
});

describe("días en hora de RD", () => {
  // 10:21 en RD = 14:21 UTC
  const ahora = new Date("2026-10-06T14:21:00Z");
  it("cierra hoy más tarde → 0", () => {
    expect(diasHasta("2026-10-06T17:50:00Z", ahora)).toBe(0);
  });
  it("mañana a las 9:00 RD → 1 (aunque falten menos de 24 h)", () => {
    expect(diasHasta("2026-10-07T13:00:00Z", ahora)).toBe(1);
  });
  it("23:30 RD de hoy es hoy aunque en UTC ya sea mañana", () => {
    expect(diasHasta("2026-10-07T03:30:00Z", ahora)).toBe(0);
  });
  it("ya cerró → negativo", () => {
    expect(diasHasta("2026-10-06T13:00:00Z", ahora)).toBe(-1);
  });
  it("hora legible en RD", () => {
    expect(horaRd("2026-10-06T17:50:00Z")).toBe("2026-10-06 13:50");
  });
});
