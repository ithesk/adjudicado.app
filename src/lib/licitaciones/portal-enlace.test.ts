import { describe, expect, it } from "vitest";
import { conNotaPortal, fichaEnNotas } from "./portal-enlace";

const FICHA = "https://comunidad.comprasdominicana.gob.do/Public/Tendering/OpportunityDetail/Index?noticeUID=DO1.NTC.1783652";

describe("fichaEnNotas", () => {
  it("saca la ficha de la nota del importador, aunque traiga la doble barra de la API", () => {
    const notas =
      "Resumen…\n\nPortal DGCP: https://comunidad.comprasdominicana.gob.do//Public/Tendering/OpportunityDetail/Index?noticeUID=DO1.NTC.1783652";
    expect(fichaEnNotas(notas)).toBe(FICHA);
  });

  it("acepta el noticeUID suelto", () => {
    expect(fichaEnNotas("aviso do1.ntc.1783652 en el portal")).toBe(FICHA);
  });

  it("null sin noticeUID o sin notas", () => {
    expect(fichaEnNotas("Renovación de 2 licencias Fortinet")).toBeNull();
    expect(fichaEnNotas(null)).toBeNull();
  });
});

describe("conNotaPortal", () => {
  it("añade la línea al final, separada por una línea en blanco", () => {
    expect(conNotaPortal("Resumen\n", FICHA)).toBe(`Resumen\n\nPortal DGCP: ${FICHA}`);
  });

  it("sin notas, la línea sola", () => {
    expect(conNotaPortal(null, FICHA)).toBe(`Portal DGCP: ${FICHA}`);
    expect(conNotaPortal("  ", FICHA)).toBe(`Portal DGCP: ${FICHA}`);
  });
});
