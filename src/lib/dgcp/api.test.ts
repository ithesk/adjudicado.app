import { afterEach, describe, expect, it, vi } from "vitest";
import { REINTENTOS, fechasEnHoraRd, listarDocumentos, listarProcesos, obtenerProceso } from "./api";
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

// La API simulada: una lista de respuestas, en orden.
function fetchSimulado(respuestas: (number | object)[]) {
  const llamadas: string[] = [];
  const f = vi.fn(async (url: string) => {
    llamadas.push(url);
    const r = respuestas.shift();
    if (r === undefined) throw new Error("fetch failed");
    if (typeof r === "number") return new Response("", { status: r });
    return Response.json({ code: 200, hasError: false, payload: { content: r } });
  });
  vi.stubGlobal("fetch", f);
  return llamadas;
}

describe("pedir (reintentos y nulos)", () => {
  afterEach(() => vi.unstubAllGlobals());
  REINTENTOS.esperas = [0, 0];

  it("reintenta un 502 y devuelve lo que llega después", async () => {
    const llamadas = fetchSimulado([502, 502, [{ codigo_proceso: "X-1" }]]);
    expect(await obtenerProceso("X-1")).toMatchObject({ codigo_proceso: "X-1" });
    expect(llamadas).toHaveLength(3);
  });

  it("se rinde tras los reintentos y dice cuántos intentó", async () => {
    fetchSimulado([503, 503, 503]);
    await expect(obtenerProceso("X-1")).rejects.toThrow(/respondió 503.*3 intentos/);
  });

  it("no reintenta un 404: es de la petición", async () => {
    const llamadas = fetchSimulado([404]);
    await expect(obtenerProceso("X-1")).rejects.toThrow(/404/);
    expect(llamadas).toHaveLength(1);
  });

  it("reintenta cuando la red falla", async () => {
    const llamadas: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        llamadas.push(url);
        if (llamadas.length === 1) throw new TypeError("fetch failed");
        return Response.json({ code: 200, hasError: false, payload: { content: [] } });
      }),
    );
    expect(await obtenerProceso("X-1")).toBeNull();
    expect(llamadas).toHaveLength(2);
  });

  it("rellena tipo_documento nulo (circulares, enmiendas) para que nadie haga trim() sobre null", async () => {
    fetchSimulado([
      [
        { nombre_documento: "Pliego.pdf", tipo_documento: "Pliego de Condiciones ", url_documento: "https://x/1" },
        { nombre_documento: "Enmienda_No.1_signed.pdf", tipo_documento: null, url_documento: "https://x/2" },
        { nombre_documento: null, tipo_documento: null, url_documento: "https://x/3" },
        { nombre_documento: "sin enlace", tipo_documento: "Otro", url_documento: null },
      ],
    ]);
    const docs = await listarDocumentos("X-1");
    expect(docs.map((d) => d.tipo_documento)).toEqual(["Pliego de Condiciones", "Otro", "Otro"]);
    expect(docs[2].nombre_documento).toBe("(sin nombre)");
  });

  it("listarProcesos dice hasta qué publicación llega la copia", async () => {
    fetchSimulado([
      [
        { codigo_proceso: "A", fecha_publicacion: "2026-10-14T18:00:01.53Z" },
        { codigo_proceso: "B", fecha_publicacion: "2026-10-13T09:00:00Z" },
        { codigo_proceso: "A", fecha_publicacion: "2026-10-14T18:00:01.53Z" },
      ],
    ]);
    const r = await listarProcesos();
    expect(r.procesos).toHaveLength(2);
    expect(r.hasta).toBe("2026-10-14T18:00:01.53-04:00");
  });
});
