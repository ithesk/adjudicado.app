import { describe, expect, it } from "vitest";
import type { Oportunidad } from "@/lib/dgcp/relevancia";
import { armarAgenda } from "./agenda";

const ahora = new Date("2026-11-22T20:00:00Z");

function op(codigo: string, cierre: string, extra: Partial<Oportunidad> = {}): Oportunidad {
  return {
    codigo, institucion: "Inst", titulo: " Título ", modalidad: "CM", monto: 1000, divisa: "DOP",
    cierre, cierre_rd: null, dias_restantes: 1, mipyme: false, coincidencias: [], socios: [], bloqueados: [],
    nivel: "media", puntaje: 30, url: null, ...extra,
  };
}

describe("armarAgenda", () => {
  it("entra lo de socios, las licencias y lo que ya trabajamos; ordena por cierre", () => {
    const r = armarAgenda(
      [
        op("TONER", "2026-11-23T14:00:00-04:00", { coincidencias: ["toner"] }),
        op("LIC", "2026-11-24T10:00:00-04:00", { coincidencias: ["licenci"] }),
        op("ADOBE", "2026-11-23T12:00:00-04:00", { nivel: "alta", socios: ["adobe"] }),
        op("NUESTRO", "2026-11-23T16:30:00-04:00", { nivel: "explorar" }),
      ],
      new Map([["NUESTRO", { estado: "calificacion" }]]),
      ahora,
    );
    expect(r.map((f) => f.codigo)).toEqual(["ADOBE", "NUESTRO", "LIC"]);
    expect(r[1].en_adjudicado).toBe("calificacion");
    expect(r[0].titulo).toBe("Título");
  });

  it("deja fuera lo cerrado, lo lejano, marcas bloqueadas, excepciones y licenciaturas", () => {
    const r = armarAgenda(
      [
        op("CERRADO", "2026-11-22T10:00:00-04:00", { nivel: "alta" }),
        op("LEJOS", "2026-12-10T10:00:00-04:00", { nivel: "alta", dias_restantes: 18 }),
        op("BLOQ", "2026-11-23T10:00:00-04:00", { nivel: "alta", bloqueados: ["x"] }),
        op("OGTIC-CCC-PEPU-2026-0009", "2026-11-23T10:00:00-04:00", { coincidencias: ["licenci"] }),
        op("UNI", "2026-11-23T10:00:00-04:00", { titulo: "Programas de licenciatura", coincidencias: ["licenci"] }),
      ],
      new Map(),
      ahora,
    );
    expect(r).toEqual([]);
  });
});
