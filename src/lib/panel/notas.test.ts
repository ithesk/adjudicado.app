import { describe, expect, it } from "vitest";
import { agregarNota, leerTrabajo, lineaNota, notasParaPanel, sumarBloque } from "./notas";

// 23/11/2026 14:05 en RD (UTC-4).
const cuando = new Date("2026-11-23T18:05:00Z");

describe("notas del Kindle", () => {
  it("arma la viñeta con la hora de RD y limpia espacios", () => {
    expect(lineaNota("  Falta   la\nfirma ", cuando)).toBe("- Kindle 23/11 14:05 · Falta la firma");
    expect(lineaNota("   ", cuando)).toBeNull();
  });

  it("añade al final y no duplica un reintento", () => {
    const l = lineaNota("Pedir póliza", cuando)!;
    const una = agregarNota("Resumen del análisis\n", l);
    expect(una).toBe(`Resumen del análisis\n${l}`);
    expect(agregarNota(una, l)).toBe(una);
    expect(agregarNota(null, l)).toBe(l);
  });

  it("suma bloques en una sola línea y no repite un bloque ya sumado", () => {
    const a = sumarBloque("Notas previas", 50, new Date("2026-11-23T17:00:30Z"));
    expect(a.sumado).toBe(true);
    expect(a.notas).toBe("Notas previas\n⏱ Trabajo en el Kindle: 50 min en 1 bloque · último 23/11/2026 13:00");

    const b = sumarBloque(`${a.notas}\n- Kindle 23/11 14:05 · Otra`, 25, new Date("2026-11-23T18:10:00Z"));
    expect(b.notas).toBe(
      "Notas previas\n⏱ Trabajo en el Kindle: 1 h 15 min en 2 bloques · último 23/11/2026 14:10\n- Kindle 23/11 14:05 · Otra",
    );
    expect(leerTrabajo(b.notas)).toEqual({ minutos: 75, bloques: 2, ultimo: new Date("2026-11-23T18:10:00Z") });

    // Reintento del mismo bloque, o uno anterior: no cambia nada.
    expect(sumarBloque(b.notas, 25, new Date("2026-11-23T18:10:40Z"))).toEqual({ notas: b.notas, sumado: false });
    expect(sumarBloque(b.notas, 0, new Date("2026-11-23T20:00:00Z")).sumado).toBe(false);
  });

  it("al panel le pasa las últimas líneas sin viñetas ni la línea de trabajo", () => {
    const notas = "**Alerta:** fianza 1 %\n\n- uno\n⏱ Trabajo en el Kindle: 2 h en 3 bloques · último 23/11/2026 09:00\n• dos";
    expect(notasParaPanel(notas)).toEqual({ notas: ["Alerta: fianza 1 %", "uno", "dos"], trabajo_min: 120 });
    expect(notasParaPanel(null)).toEqual({ notas: [], trabajo_min: 0 });
  });
});
