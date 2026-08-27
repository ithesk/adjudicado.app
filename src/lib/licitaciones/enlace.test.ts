import { describe, it, expect } from "vitest";
import {
  buscarProcesoPorExpediente,
  normalizarExpediente,
  proponerAdjudicar,
} from "./enlace";

const proc = (codigo: string, estado = "armado", id = codigo) => ({
  id,
  codigo,
  estado,
});

describe("normalizarExpediente", () => {
  it("ignora mayúsculas, acentos y puntuación", () => {
    expect(normalizarExpediente("MJ-DAF-CM-2026-0022")).toBe("MJDAFCM20260022");
    expect(normalizarExpediente("mj daf cm 2026 0022")).toBe("MJDAFCM20260022");
    expect(normalizarExpediente("Defensor del Pueblo-DAF-CM-2026-0026")).toBe(
      "DEFENSORDELPUEBLODAFCM20260026",
    );
  });

  it("nulo y vacío dan cadena vacía, no revientan", () => {
    expect(normalizarExpediente(null)).toBe("");
    expect(normalizarExpediente(undefined)).toBe("");
    expect(normalizarExpediente("   ")).toBe("");
  });
});

describe("buscarProcesoPorExpediente", () => {
  const procesos = [
    proc("MJ-DAF-CM-2026-0022"),
    proc("DGCINE-DAF-CD-2026-0056", "adjudicado"),
    proc("Defensor del Pueblo-DAF-CM-2026-0026", "listo"),
  ];

  it("cruza el caso REAL que en crudo no cruzaba: punto contra guion", () => {
    // Tal cual está en la base: la orden trae punto donde la licitación
    // tiene guion. Es la coincidencia que se perdería comparando literal.
    const r = buscarProcesoPorExpediente(
      "DEFENSOR DEL PUEBLO-DAF-CM-2026.0026",
      procesos,
    );
    expect(r?.codigo).toBe("Defensor del Pueblo-DAF-CM-2026-0026");
  });

  it("cruza el expediente exacto", () => {
    expect(buscarProcesoPorExpediente("MJ-DAF-CM-2026-0022", procesos)?.id).toBe(
      "MJ-DAF-CM-2026-0022",
    );
  });

  it("sin coincidencia devuelve null — el caso normal, no un error", () => {
    // La licitación se trabajó fuera del sistema: 28 de 33 órdenes reales.
    expect(buscarProcesoPorExpediente("INAPA-DAF-CM-2026-0999", procesos)).toBeNull();
  });

  it("sin expediente no inventa nada", () => {
    expect(buscarProcesoPorExpediente(null, procesos)).toBeNull();
    expect(buscarProcesoPorExpediente("", procesos)).toBeNull();
    expect(buscarProcesoPorExpediente("   ", procesos)).toBeNull();
  });

  it("NO cruza por parecido: un enlace equivocado es peor que ninguno", () => {
    // Contiene al otro, pero no es el mismo expediente.
    expect(
      buscarProcesoPorExpediente("MJ-DAF-CM-2026-00221", procesos),
    ).toBeNull();
    expect(buscarProcesoPorExpediente("MJ-DAF-CM-2026", procesos)).toBeNull();
  });

  it("con dos procesos del mismo expediente no adivina", () => {
    const ambiguos = [proc("X-2026-1", "armado", "a"), proc("X 2026 1", "listo", "b")];
    expect(buscarProcesoPorExpediente("X-2026-1", ambiguos)).toBeNull();
  });

  it("sin procesos en el sistema no falla", () => {
    expect(buscarProcesoPorExpediente("MJ-DAF-CM-2026-0022", [])).toBeNull();
  });
});

describe("proponerAdjudicar", () => {
  it("propone en todos los estados previos a reconocer la victoria", () => {
    for (const e of ["captura", "calificacion", "costeo", "armado", "listo", "sometido", "subsanacion"]) {
      expect(proponerAdjudicar(e), e).toBe(true);
    }
  });

  it("no propone si ya está adjudicada", () => {
    expect(proponerAdjudicar("adjudicado")).toBe(false);
  });

  it("propone también en perdido y descartado: ahí hay una contradicción", () => {
    // Llegó la orden de compra de algo marcado como perdido. Algo está mal.
    expect(proponerAdjudicar("perdido")).toBe(true);
    expect(proponerAdjudicar("descartado")).toBe(true);
  });
});
