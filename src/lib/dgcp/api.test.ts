import { describe, expect, it } from "vitest";
import { fechasEnHoraRd } from "./api";
import { horaRd } from "./relevancia";

describe("fechasEnHoraRd", () => {
  it("lee la «Z» de la API como hora de RD", () => {
    const p = fechasEnHoraRd({
      fecha_fin_recepcion_ofertas: "2026-10-12T15:00:00Z",
      fecha_entrega_oferta: "2026-07-31T08:36:06.293Z",
      titulo: "Drones 12:00Z",
      fecha_publicacion: null,
    });
    expect(p.fecha_fin_recepcion_ofertas).toBe("2026-10-12T15:00:00-04:00");
    expect(p.fecha_entrega_oferta).toBe("2026-07-31T08:36:06.293-04:00");
    expect(p.titulo).toBe("Drones 12:00Z");
    expect(p.fecha_publicacion).toBeNull();
    // El cierre que el portal muestra a las 15:00 sale a las 15:00, no a las 11:00.
    expect(horaRd(p.fecha_fin_recepcion_ofertas)).toBe("2026-10-12 15:00");
  });
});
