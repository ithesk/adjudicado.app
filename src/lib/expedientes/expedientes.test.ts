import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { DgcpContrato, DgcpOferta } from "@/lib/dgcp/api";
import { hayQueRefrescar, type FilaExpediente } from "./almacen";
import { esNegativa, partirPdf, separarPaginas } from "./ocr";
import { esPliego, guardarAlBajar, prioridad } from "./preparar";
import { claveEmpresa, estadisticas, mismoOferente, resultadoLigero } from "./resultados";
import { coincideRuta } from "./servicio";

const oferta = (razon_social: string, rpe: string, valor: number): DgcpOferta => ({
  id_oferta: rpe,
  codigo_proceso: "X-1",
  rpe,
  razon_social,
  nombre_oferta: null,
  valor_oferta: valor,
  estado_oferta: "Cargada",
  estado_evaluacion: "Pendiente",
  tipo_oferta: "Oferta digital",
  fecha_entrega_oferta: "2026-08-20T09:00:00-04:00",
});
const contrato = (razon_social: string, rpe: string, valor: number): DgcpContrato => ({
  codigo_contrato: `C-${rpe}`,
  codigo_proceso: "X-1",
  estado_contrato: "Activo",
  estado_adjudicacion: "Confirmada",
  fecha_adjudicacion: "2026-09-15T10:00:00-04:00",
  divisa: "DOP",
  valor_contratado: valor,
  rpe,
  razon_social,
  url_contrato: null,
});
const nosotros = { rpe: "116764", razon_social: "Innovación Tecnológica SK, SRL" };

describe("empresas", () => {
  it("reconoce la misma razón social escrita distinto", () => {
    expect(claveEmpresa("Innovacion Tecnologica Sk,SRL")).toBe(claveEmpresa("INNOVACIÓN TECNOLÓGICA SK, S.R.L."));
    expect(mismoOferente({ razon_social: "Seti & Sidif Dominicana, SRL\t" }, { razon_social: "SETI & SIDIF DOMINICANA SRL" })).toBe(true);
    // Con RPE en ambos, manda el RPE.
    expect(mismoOferente({ rpe: "1", razon_social: "A" }, { rpe: "2", razon_social: "A" })).toBe(false);
  });
});

describe("resultadoLigero", () => {
  const ofertas = [oferta("Avante Consulting Group, SRL", "120179", 55204), oferta("Innovacion Tecnologica Sk,SRL", "116764", 58554)];

  it("perdido cuando se adjudica a otro", () => {
    const r = resultadoLigero("Proceso adjudicado y celebrado", ofertas, [contrato("Avante Consulting Group, SRL", "120179", 55204)], nosotros);
    expect(r.resultado).toBe("perdido");
    expect(r.nuestro_monto).toBe(58554);
    expect(r.monto_ganador).toBe(55204);
    expect(r.competidores).toEqual([
      { razon_social: "Avante Consulting Group, SRL", rpe: "120179", valor_oferta: 55204, adjudicado: true, valor_adjudicado: 55204 },
    ]);
  });

  it("ganado, parcial, desierto, cancelado y pendiente", () => {
    expect(resultadoLigero("x", ofertas, [contrato("Innovacion Tecnologica Sk,SRL", "116764", 58554)], nosotros).resultado).toBe("ganado");
    expect(
      resultadoLigero("x", ofertas, [contrato("Innovacion Tecnologica Sk,SRL", "116764", 1), contrato("Avante", "120179", 2)], nosotros)
        .resultado,
    ).toBe("parcial");
    expect(resultadoLigero("Proceso desierto", ofertas, [], nosotros).resultado).toBe("desierto");
    expect(resultadoLigero("Proceso cancelado", ofertas, [], nosotros).resultado).toBe("cancelado");
    // Adjudicado sin contratos en la API: la API va atrasada.
    expect(resultadoLigero("Proceso adjudicado y celebrado", ofertas, [], nosotros).resultado).toBe("pendiente");
  });
});

describe("estadisticas", () => {
  it("tasa de éxito, causas y quién nos gana", () => {
    const e = estadisticas([
      {
        resultado: "perdido",
        causa: "precio",
        institucion: "MEM",
        nuestro_monto: 100,
        monto_adjudicado: null,
        competidores: [{ razon_social: "Avante, SRL", rpe: "1", valor_oferta: 90, adjudicado: true, valor_adjudicado: 90 }],
      },
      {
        resultado: "perdido",
        causa: null,
        institucion: "MEM",
        nuestro_monto: 200,
        monto_adjudicado: null,
        competidores: [{ razon_social: "AVANTE SRL", rpe: "1", valor_oferta: 180, adjudicado: true, valor_adjudicado: 180 }],
      },
      { resultado: "ganado", causa: null, institucion: "OGTIC", nuestro_monto: 50, monto_adjudicado: 50, competidores: [] },
      { resultado: "pendiente", causa: null, institucion: "OGTIC", nuestro_monto: 10, monto_adjudicado: null, competidores: [] },
    ]);
    expect(e.decididos).toBe(3);
    expect(e.tasa_exito_pct).toBe(33.3);
    expect(e.causas_de_perdida).toEqual({ precio: 1 });
    expect(e.sin_causa_conocida).toBe(1);
    expect(e.monto_ganado).toBe(50);
    expect(e.competidores[0]).toEqual({ razon_social: "Avante, SRL", coincidencias: 2, nos_gano: 2, diferencia_mediana_pct: 10 });
    expect(e.por_institucion[0]).toEqual({ institucion: "MEM", procesos: 2, ganados: 0, perdidos: 2 });
  });
});

describe("caché del expediente", () => {
  const fila = (o: Partial<FilaExpediente>): FilaExpediente => ({
    codigo: "X-1",
    estado: "listo",
    fase: "listo",
    estado_dgcp: "Proceso adjudicado y celebrado",
    archivos: [],
    analisis: null,
    error: null,
    intentos: 0,
    trabajando_hasta: null,
    descargado_at: "2026-10-01T00:00:00Z",
    listo_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...o,
  });
  const ahora = new Date("2026-10-12T00:00:00Z");

  it("un proceso cerrado no se vuelve a bajar", () => {
    expect(hayQueRefrescar(fila({}), "Proceso adjudicado y celebrado", ahora)).toBe(false);
  });
  it("uno en evaluación se refresca a las 12 h o si cambió de estado", () => {
    const enEvaluacion = fila({ estado_dgcp: "Proceso publicado", descargado_at: "2026-10-11T20:00:00Z" });
    expect(hayQueRefrescar(enEvaluacion, "Proceso publicado", ahora)).toBe(false);
    expect(hayQueRefrescar(enEvaluacion, "Proceso adjudicado y celebrado", ahora)).toBe(true);
    expect(hayQueRefrescar({ ...enEvaluacion, descargado_at: "2026-10-11T08:00:00Z" }, "Proceso publicado", ahora)).toBe(true);
  });
  it("sin descarga, hay que bajarlo; un error en el OCR no obliga a bajarlo otra vez", () => {
    expect(hayQueRefrescar(null, null, ahora)).toBe(true);
    expect(hayQueRefrescar(fila({ descargado_at: null }), null, ahora)).toBe(true);
    expect(hayQueRefrescar(fila({ estado: "error", fase: "ocr" }), "Proceso adjudicado y celebrado", ahora)).toBe(false);
  });

  it("ordena lo que decide el resultado primero y reconoce el pliego", () => {
    const rutas = ["1_Publicaciones/Adjuntos/Pliego.pdf", "8_Mensajes/M.pdf", "6_Adjudicacion/Acta.pdf", "4_AperturaDeSobres/Informe.pdf"];
    expect([...rutas].sort((a, b) => prioridad(a) - prioridad(b))[0]).toBe("6_Adjudicacion/Acta.pdf");
    expect(esPliego("1_Publicaciones/Adjuntos/DO1_CDOC_1_Ficha Técnica - Drones.pdf")).toBe(true);
    expect(esPliego("1_Publicaciones/Adjuntos/Certificacion de fondos.pdf")).toBe(false);
  });

  it("al bajar guarda lo clave y lo chico; lo grande solo se lista", () => {
    const MB = 1024 * 1024;
    expect(guardarAlBajar("6_Adjudicacion/Acta.pdf", 20 * MB)).toBe(true);
    expect(guardarAlBajar("3_Ofertas/Acme/DO1_DOC_1_Oferta Técnica.pdf", 2 * MB)).toBe(true);
    expect(guardarAlBajar("3_Ofertas/Acme/DO1_DOC_2_Estatutos.pdf", 9 * MB)).toBe(false);
    expect(guardarAlBajar("6_Adjudicacion/Enorme.pdf", 60 * MB)).toBe(false);
  });

  it("encuentra un archivo por palabras de su ruta", () => {
    const r = "3_Ofertas/Avante Consulting Group, SRL/DO1_DOC_129883313_ACG - Oferta Técnica.pdf";
    expect(coincideRuta(r, "avante oferta tecnica")).toBe(true);
    expect(coincideRuta(r, "avante economica")).toBe(false);
  });
});

describe("OCR por tramos", () => {
  it("parte un PDF en tramos de 8 páginas", async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 19; i++) doc.addPage();
    const tramos = await partirPdf(await doc.save());
    expect(tramos.map((t) => t.desde)).toEqual([1, 9, 17]);
    expect((await PDFDocument.load(tramos[2].pdf)).getPageCount()).toBe(3);
  });

  it("separa páginas y detecta negativas", () => {
    expect(separarPaginas("--- página 1 ---\nA\n--- página 2 ---\nB")).toEqual(["A", "B"]);
    expect(separarPaginas("Texto sin separador")).toEqual(["Texto sin separador"]);
    expect(esNegativa("Lo siento, pero no puedo transcribir el documento que has proporcionado.")).toBe(true);
    expect(esNegativa("I'm sorry, but I can't assist with that.")).toBe(true);
    expect(esNegativa("ACTA DE ADJUDICACIÓN NÚM. 13/2026 … " + "x".repeat(500))).toBe(false);
  });
});
