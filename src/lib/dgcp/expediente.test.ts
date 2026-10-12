import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { decodificarCp437, esDocumentoClave, partesRuta, recorrerZip } from "./expediente";

// El ZIP llega de la red en trozos de cualquier tamaño: se parte a propósito
// en pedazos chicos para que las cabeceras queden cortadas entre trozos.
async function* enTrozos(b: Uint8Array, tam = 7) {
  for (let i = 0; i < b.length; i += tam) yield Buffer.from(b.subarray(i, i + tam));
}

function zipDePrueba(compresion: "STORE" | "DEFLATE") {
  const z = new PizZip();
  z.file("1_Publicaciones/Pliego.pdf", "%PDF pliego");
  z.file("3_Ofertas/Ofertas.pdf", "%PDF lista");
  z.file("3_Ofertas/Acme, SRL/DO1_DOC_1_Oferta.pdf", "x".repeat(5000));
  z.file("3_Ofertas/Acme, SRL/DO1_RANL_9_Resumen.pdf", "%PDF resumen acme");
  z.file("6_Adjudicacion/Acta.pdf", "%PDF acta");
  return z.generate({ type: "uint8array", compression: compresion });
}

describe("recorrerZip", () => {
  for (const compresion of ["STORE", "DEFLATE"] as const) {
    it(`lista todo y guarda solo lo pedido (${compresion})`, async () => {
      const r = await recorrerZip(enTrozos(zipDePrueba(compresion)), {
        guardar: (ruta) => esDocumentoClave(ruta),
      });
      expect(r.completo).toBe(true);
      expect(r.entradas.map((e) => e.ruta)).toContain("3_Ofertas/Acme, SRL/DO1_DOC_1_Oferta.pdf");
      expect(r.entradas.find((e) => e.ruta.endsWith("Oferta.pdf"))?.bytes).toBe(5000);
      expect([...r.archivos.keys()].sort()).toEqual([
        "3_Ofertas/Acme, SRL/DO1_RANL_9_Resumen.pdf",
        "3_Ofertas/Ofertas.pdf",
        "6_Adjudicacion/Acta.pdf",
      ]);
      expect(Buffer.from(r.archivos.get("6_Adjudicacion/Acta.pdf")!).toString()).toBe("%PDF acta");
    });
  }

  it("corta la descarga apenas encuentra el archivo buscado", async () => {
    const r = await recorrerZip(enTrozos(zipDePrueba("DEFLATE")), {
      guardar: (ruta) => ruta.endsWith("Oferta.pdf"),
      pararTras: () => true,
    });
    expect(r.completo).toBe(false);
    expect(r.motivoCorte).toBe("encontrado");
    expect(Buffer.from(r.archivos.get("3_Ofertas/Acme, SRL/DO1_DOC_1_Oferta.pdf")!).toString()).toBe("x".repeat(5000));
    expect(r.entradas.some((e) => e.ruta.startsWith("6_"))).toBe(false);
  });

  it("respeta el tope de lo guardado", async () => {
    const r = await recorrerZip(enTrozos(zipDePrueba("STORE")), { guardar: () => true, maxGuardado: 100 });
    expect(r.archivos.has("3_Ofertas/Acme, SRL/DO1_DOC_1_Oferta.pdf")).toBe(false);
    expect(r.archivos.has("6_Adjudicacion/Acta.pdf")).toBe(true);
  });
});

describe("nombres y rutas", () => {
  it("decodifica CP437 como lo manda el portal", () => {
    expect(decodificarCp437(Uint8Array.from([0x54, 0x82, 0x63, 0x6e, 0x69, 0x63, 0x61]))).toBe("Técnica");
    expect(decodificarCp437(Uint8Array.from([0x4f, 0x62, 0x6a, 0x65, 0x63, 0x69, 0xa2, 0x6e]))).toBe("Objeción");
  });

  it("separa carpeta, oferente y archivo", () => {
    expect(partesRuta("3_Ofertas/Acme, SRL/DO1_DOC_1_Oferta.pdf")).toEqual({
      carpeta: "3_Ofertas",
      oferente: "Acme, SRL",
      archivo: "DO1_DOC_1_Oferta.pdf",
    });
    expect(partesRuta("3_Ofertas/Ofertas.pdf").oferente).toBeNull();
  });

  it("marca como clave las actas, resúmenes y mensajes, no las ofertas", () => {
    expect(esDocumentoClave("3_Ofertas/Acme, SRL/DO1_RANL_2254151_Resumen.pdf")).toBe(true);
    expect(esDocumentoClave("3_Ofertas/Acme, SRL/DO1_DOC_1_Sobre_A.pdf")).toBe(false);
    expect(esDocumentoClave("6_Adjudicacion/FinalReport.pdf")).toBe(true);
    expect(esDocumentoClave("1_Publicaciones/Pliego.pdf")).toBe(false);
  });
});
