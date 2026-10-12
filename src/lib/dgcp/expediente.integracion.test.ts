// Contra el portal real (baja ~90 MB). Solo a mano:
//   INTEGRACION=1 pnpm vitest run src/lib/dgcp/expediente.integracion.test.ts
import { describe, expect, it } from "vitest";
import * as dgcp from "./api";
import { esDocumentoClave, recorrerExpediente } from "./expediente";
import { extraerTexto } from "./texto";

const CODIGO = "MEM-DAF-CM-2026-0078";

describe.skipIf(!process.env.INTEGRACION)("expediente real", () => {
  it(
    "baja el expediente, lista las ofertas y lee el acta de adjudicación",
    async () => {
      const proceso = await dgcp.obtenerProceso(CODIGO);
      expect(proceso?.url).toBeTruthy();
      const inicio = Date.now();
      const r = await recorrerExpediente(proceso!.url!, { guardar: esDocumentoClave });
      console.log(`expediente: ${r.entradas.length} archivos en ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
      expect(r.completo).toBe(true);
      expect(r.entradas.some((e) => e.ruta.includes("Innovacion Tecnologica Sk,SRL/"))).toBe(true);
      expect(r.entradas.some((e) => e.ruta.includes("Oferta Técnica"))).toBe(true);
      const acta = [...r.archivos].find(([ruta]) => ruta.startsWith("6_Adjudicacion/"));
      const texto = await extraerTexto(acta![0], acta![1]);
      expect(texto.paginas.join(" ")).toMatch(/Avante Consulting Group/);

      const [ofertas, contratos] = await Promise.all([dgcp.listarOfertas(CODIGO), dgcp.listarContratos(CODIGO)]);
      expect(ofertas.length).toBe(5);
      expect(contratos.map((c) => c.razon_social)).toContain("Avante Consulting Group, SRL");
    },
    180_000,
  );

  it(
    "corta la descarga al encontrar un archivo",
    async () => {
      const proceso = await dgcp.obtenerProceso(CODIGO);
      const r = await recorrerExpediente(proceso!.url!, {
        guardar: (ruta) => ruta.includes("Oferta Técnica"),
        pararTras: () => true,
      });
      expect(r.motivoCorte).toBe("encontrado");
      expect(r.archivos.size).toBe(1);
    },
    180_000,
  );

  it("descarga documentos sueltos pese a la cadena incompleta del portal", async () => {
    const docs = await dgcp.listarDocumentos(CODIGO);
    const { bytes } = await dgcp.descargarDocumento(docs[0].url_documento);
    expect(Buffer.from(bytes.subarray(0, 4)).toString()).toBe("%PDF");
  });
});
