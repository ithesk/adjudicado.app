import { describe, expect, it } from "vitest";
import type { DgcpProceso } from "./api";
import { fusionar, interpretarReferencia } from "./fuentes";
import type { AvisoPortal } from "./portal-busqueda";

const proc = (codigo: string, extra: Partial<DgcpProceso> = {}): DgcpProceso => ({
  codigo_proceso: codigo,
  unidad_compra: "Entidad",
  modalidad: "Contratación Menor",
  titulo: "Licencias",
  descripcion: null,
  estado_proceso: "Proceso publicado",
  divisa: "DOP",
  monto_estimado: 100,
  fecha_publicacion: "2026-10-14T10:00:00-04:00",
  fecha_fin_recepcion_ofertas: "2026-10-20T10:00:00-04:00",
  fecha_apertura_ofertas: null,
  fecha_estimada_adjudicacion: null,
  dirigido_mipymes: "No",
  dirigido_mipymes_mujeres: "No",
  proceso_lotificado: "No",
  objeto_proceso: null,
  url: null,
  ...extra,
});

const aviso = (codigo: string, extra: Partial<AvisoPortal> = {}): AvisoPortal => ({
  codigo,
  institucion: "Entidad",
  titulo: "Licencias nuevas",
  fase: "ProcedureProfile_DGCP-01-ComprasMenores_Phase_TenderingPhase_Label",
  publicado: "2026-10-15T08:00:00-04:00",
  cierre: "2026-10-21T08:00:00-04:00",
  monto: 200,
  divisa: "DOP",
  estado: "Published",
  uid: "DO1.NTC.1",
  ...extra,
});

const ahora = new Date("2026-10-15T12:30:00Z");

describe("fusionar", () => {
  it("añade lo que solo el portal tiene y respeta lo de la API", () => {
    const r = fusionar([proc("A-1"), proc("B-2")], [aviso("B-2", { monto: 999 }), aviso("C-3")], ahora);
    expect(r.procesos.map((p) => p.codigo_proceso)).toEqual(["A-1", "B-2", "C-3"]);
    expect(r.procesos[1].monto_estimado).toBe(100); // la API manda
    expect(r.origen.get("C-3")).toBe("portal");
    expect(r.origen.get("A-1")).toBe("api");
    expect(r.nuevosPortal).toBe(1);
    expect(r.procesos[2].estado_proceso).toBe("Proceso publicado");
    expect(r.procesos[2].modalidad).toBe("Contratación Menor");
  });

  it("deja fuera lo cerrado, lo adjudicado y lo ya vencido", () => {
    const r = fusionar(
      [],
      [
        aviso("X-1", { estado: "ClosedForReplies" }),
        aviso("X-2", { estado: "Awarded" }),
        aviso("X-3", { cierre: "2026-10-15T08:00:00-04:00" }),
        aviso("X-4"),
      ],
      ahora,
    );
    expect(r.procesos.map((p) => p.codigo_proceso)).toEqual(["X-4"]);
  });
});

describe("interpretarReferencia", () => {
  it("distingue código, enlace del portal y noticeUID", () => {
    expect(interpretarReferencia("  MIMARENA-DAF-CM-2026-0125 ")).toEqual({ codigo: "MIMARENA-DAF-CM-2026-0125" });
    expect(
      interpretarReferencia("https://comunidad.comprasdominicana.gob.do//Public/Tendering/OpportunityDetail/Index?noticeUID=DO1.NTC.1784801"),
    ).toEqual({ uid: "DO1.NTC.1784801" });
    expect(interpretarReferencia("DO1.NTC.1784801")).toEqual({ uid: "DO1.NTC.1784801" });
    // Los códigos con espacios y minúsculas se respetan tal cual (así están en la DGCP).
    expect(interpretarReferencia("Defensor del Pueblo-DAF-CM-2026-0026")).toEqual({ codigo: "Defensor del Pueblo-DAF-CM-2026-0026" });
  });
});
