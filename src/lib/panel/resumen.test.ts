import { describe, expect, it } from "vitest";
import { resumirProcesos, type FilaProceso } from "./resumen";

const ahora = new Date("2026-11-22T12:00:00Z");

function proceso(id: string, cierre: string | null, estado = "armado"): FilaProceso {
  return { id, codigo: `X-${id}`, objeto: "Objeto", estado, cierre, institucion: { nombre: "Inst", siglas: "IN" } };
}

describe("resumirProcesos", () => {
  it("deja fuera los vencidos, los cuenta y ordena por fecha límite", () => {
    const r = resumirProcesos(
      [proceso("a", "2026-11-30T15:00:00Z"), proceso("b", "2026-11-20T15:00:00Z"), proceso("c", "2026-11-25T15:00:00Z")],
      [],
      [],
      [],
      ahora,
    );
    expect(r.procesos.map((p) => p.codigo)).toEqual(["X-c", "X-a"]);
    expect(r.vencidos).toBe(1);
  });

  it("cuenta como listos los requisitos cubiertos por documentos de la empresa", () => {
    const r = resumirProcesos(
      [proceso("a", "2026-11-30T15:00:00Z")],
      [
        { proceso_id: "a", nombre: "Formulario", estado: "listo", cubierto: false },
        { proceso_id: "a", nombre: "MIPYME", estado: "pendiente", cubierto: true },
        { proceso_id: "a", nombre: "DGII", estado: "pendiente", cubierto: false },
      ],
      [
        { proceso_id: "a", ofertamos: true, cotizado: true },
        { proceso_id: "a", ofertamos: null, cotizado: false },
        { proceso_id: "a", ofertamos: false, cotizado: false },
      ],
      [],
      ahora,
    );
    expect(r.procesos[0].requisitos).toEqual({ listos: 2, total: 3, faltan: ["DGII"] });
    expect(r.procesos[0].items).toEqual({ cotizados: 1, total: 2 });
  });

  it("en subsanación usa el plazo de la subsanación, aunque el cierre ya pasó", () => {
    const r = resumirProcesos(
      [proceso("a", "2026-11-01T15:00:00Z", "subsanacion")],
      [],
      [],
      [{ proceso_id: "a", fecha_limite: "2026-11-24T20:00:00Z" }],
      ahora,
    );
    expect(r.procesos[0]).toMatchObject({ limite: "2026-11-24T20:00:00Z", tipo_limite: "subsanacion" });
  });
});
