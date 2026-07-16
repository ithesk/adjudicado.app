import { describe, it, expect } from "vitest";
import { enteroALetras, montoALetras } from "./letras";

describe("enteroALetras", () => {
  const casos: [number, string][] = [
    [0, "CERO"],
    [1, "UNO"],
    [16, "DIECISÉIS"],
    [21, "VEINTIUNO"],
    [29, "VEINTINUEVE"],
    [30, "TREINTA"],
    [31, "TREINTA Y UNO"],
    [100, "CIEN"],
    [101, "CIENTO UNO"],
    [116, "CIENTO DIECISÉIS"],
    [500, "QUINIENTOS"],
    [700, "SETECIENTOS"],
    [999, "NOVECIENTOS NOVENTA Y NUEVE"],
    [1_000, "MIL"],
    [1_021, "MIL VEINTIUNO"],
    [21_000, "VEINTIÚN MIL"],
    [31_000, "TREINTA Y UN MIL"],
    [73_200, "SETENTA Y TRES MIL DOSCIENTOS"],
    [100_000, "CIEN MIL"],
    [329_376, "TRESCIENTOS VEINTINUEVE MIL TRESCIENTOS SETENTA Y SEIS"],
    [1_000_000, "UN MILLÓN"],
    [2_000_001, "DOS MILLONES UNO"],
    [21_000_000, "VEINTIÚN MILLONES"],
    [1_234_567, "UN MILLÓN DOSCIENTOS TREINTA Y CUATRO MIL QUINIENTOS SESENTA Y SIETE"],
  ];
  for (const [n, esperado] of casos) {
    it(`${n} → ${esperado}`, () => expect(enteroALetras(n)).toBe(esperado));
  }
});

describe("montoALetras", () => {
  it("el monto típico de una oferta", () => {
    expect(montoALetras(329_376)).toBe(
      "TRESCIENTOS VEINTINUEVE MIL TRESCIENTOS SETENTA Y SEIS PESOS DOMINICANOS CON 00/100",
    );
  });
  it("con centavos", () => {
    expect(montoALetras(1_500.75)).toBe(
      "MIL QUINIENTOS PESOS DOMINICANOS CON 75/100",
    );
  });
  it("un peso, en singular", () => {
    expect(montoALetras(1)).toBe("UN PESO DOMINICANO CON 00/100");
  });
  it("el redondeo es del monto completo (10.999 = 11.00, no '10 con 100/100')", () => {
    expect(montoALetras(10.999)).toBe("ONCE PESOS DOMINICANOS CON 00/100");
    expect(montoALetras(10.99)).toBe("DIEZ PESOS DOMINICANOS CON 99/100");
  });
});
