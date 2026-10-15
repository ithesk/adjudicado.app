import { describe, expect, it } from "vitest";
import { anosOperando, diligenciaDe, faltantesDiligencia, limpiarPersonas } from "./diligencia";

describe("limpiarPersonas", () => {
  it("normaliza, descarta roles desconocidos y filas sin nombre", () => {
    const p = limpiarPersonas([
      { nombre: " Pablo Holguín ", documento: "224-0020921-3", porcentaje: "60", roles: ["accionista", "jefe", "beneficiario_final"] },
      { nombre: "", roles: ["accionista"] },
      { nombre: "Ana", porcentaje: 140, roles: "accionista" },
    ]);
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ nombre: "Pablo Holguín", porcentaje: 60, roles: ["accionista", "beneficiario_final"] });
    expect(p[1]).toMatchObject({ nombre: "Ana", porcentaje: null, roles: [] });
  });
});

describe("anosOperando", () => {
  it("cuenta años completos", () => {
    expect(anosOperando("2015-03-10", new Date(2026, 9, 15))).toBe(11);
    expect(anosOperando("2015-11-20", new Date(2026, 9, 15))).toBe(10);
    expect(anosOperando(null)).toBeNull();
  });
});

describe("faltantesDiligencia", () => {
  const completo = diligenciaDe({
    registro_mercantil: "12345SD",
    fecha_constitucion: "2015-03-10",
    financiamiento_principal: "Fondos propios",
    relacion_pep: "No",
    personas: [
      { nombre: "Pablo", documento: "22400209213", porcentaje: 100, roles: ["accionista", "beneficiario_final", "directivo", "tecnico"] },
    ],
  });

  it("completo no falta nada", () => {
    expect(faltantesDiligencia(completo)).toEqual([]);
  });

  it("dice qué falta y si los porcentajes no suman 100", () => {
    const f = faltantesDiligencia({
      ...completo,
      registro_mercantil: null,
      personas: [{ ...completo.personas[0], porcentaje: 60, documento: null }],
    });
    expect(f).toContain("número de registro mercantil");
    expect(f.some((x) => x.includes("documento de identidad de Pablo"))).toBe(true);
    expect(f.some((x) => x.includes("suman 60%"))).toBe(true);
  });

  it("tolera un perfil sin las columnas nuevas (SQL sin correr)", () => {
    expect(faltantesDiligencia(diligenciaDe(null)).length).toBeGreaterThan(5);
  });
});
