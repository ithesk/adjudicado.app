import { describe, expect, it } from "vitest";
import { bloquesDeNotas } from "./NotasProceso";

describe("bloquesDeNotas", () => {
  it("separa párrafos por línea en blanco y agrupa viñetas", () => {
    expect(
      bloquesDeNotas("Resumen del proceso.\nSegunda línea.\n\nAlertas:\n- Carta de fabricante\n• Paga a 90 días\n\n\nPortal DGCP: https://x"),
    ).toEqual([
      { tipo: "p", lineas: ["Resumen del proceso.", "Segunda línea."] },
      { tipo: "p", lineas: ["Alertas:"] },
      { tipo: "ul", items: ["Carta de fabricante", "Paga a 90 días"] },
      { tipo: "p", lineas: ["Portal DGCP: https://x"] },
    ]);
  });
  it("texto vacío no produce bloques", () => {
    expect(bloquesDeNotas("  \n\n")).toEqual([]);
  });
});
