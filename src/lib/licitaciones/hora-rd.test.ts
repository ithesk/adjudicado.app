import { describe, expect, it } from "vitest";
import {
  cierreCortoRd,
  cierreDesdeLocalRd,
  cierreLocalRd,
  instanteCierre,
  nivelCierre,
  restante,
  textoRestante,
} from "./hora-rd";

describe("cierre en hora de RD", () => {
  it("lo que devuelve la base (UTC) se enseña en hora de RD", () => {
    // CECANOT-DAF-CM-2026-0265: cierra el 05/11 a las 09:00 de RD.
    expect(cierreLocalRd("2026-11-05T13:00:00+00:00")).toBe("2026-11-05T09:00");
    expect(cierreCortoRd("2026-11-05T13:00:00+00:00")).toBe("05/11 09:00");
  });

  it("lo que llega de la DGCP con -04:00 se queda igual", () => {
    expect(cierreLocalRd("2026-11-05T09:00:00-04:00")).toBe("2026-11-05T09:00");
  });

  it("cruza la medianoche hacia el día anterior", () => {
    expect(cierreCortoRd("2026-11-06T02:30:00Z")).toBe("05/11 22:30");
  });

  it("lo escrito en el formulario se guarda con -04:00", () => {
    const iso = cierreDesdeLocalRd("2026-11-05T09:00");
    expect(iso).toBe("2026-11-05T09:00:00-04:00");
    expect(instanteCierre(iso)).toBe(Date.parse("2026-11-05T13:00:00Z"));
    expect(cierreDesdeLocalRd("")).toBeNull();
  });

  it("sin fecha o con basura no inventa nada", () => {
    expect(instanteCierre(null)).toBeNull();
    expect(instanteCierre("mañana")).toBeNull();
    expect(cierreCortoRd(null)).toBe("");
  });
});

describe("contador regresivo", () => {
  const cierre = Date.parse("2026-11-05T13:00:00Z");

  it("más de un día: días y reloj", () => {
    const r = restante(cierre, Date.parse("2026-11-03T08:47:51Z"));
    expect(textoRestante(r)).toBe("2d 04:12:09");
    expect(textoRestante(r, false)).toBe("2d 4h 12m");
    expect(nivelCierre(r)).toBe("ambar");
  });

  it("el último día: solo el reloj, en rojo", () => {
    const r = restante(cierre, Date.parse("2026-11-05T12:59:30Z"));
    expect(textoRestante(r)).toBe("00:00:30");
    expect(nivelCierre(r)).toBe("rojo");
  });

  it("con tiempo de sobra: verde", () => {
    expect(nivelCierre(restante(cierre, Date.parse("2026-10-30T13:00:00Z")))).toBe("verde");
  });

  it("ya cerrado: cuánto hace", () => {
    expect(textoRestante(restante(cierre, cierre))).toBe("Cerrado hace 0m");
    const r = restante(cierre, Date.parse("2026-11-05T15:05:00Z"));
    expect(textoRestante(r)).toBe("Cerrado hace 2h 05m");
    expect(nivelCierre(r)).toBe("vencido");
    expect(textoRestante(restante(cierre, Date.parse("2026-11-08T16:00:00Z")))).toBe(
      "Cerrado hace 3d 3h",
    );
  });
});
