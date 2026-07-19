import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { analizarDocx, aplicarAsignaciones, resolverPlantillas } from "./plantillas";

// Construye un .docx mínimo. Cada párrafo es una lista de runs (para poder
// probar texto PARTIDO entre runs — el caso que muerde en Word real).
function docx(parrafos: string[][]): Buffer {
  const cuerpo = parrafos
    .map(
      (runs) =>
        `<w:p>${runs
          .map((t) => `<w:r><w:rPr><w:color w:val="FF0000"/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r>`)
          .join("")}</w:p>`,
    )
    .join("");
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${cuerpo}</w:body></w:document>`,
  );
  return zip.generate({ type: "nodebuffer" });
}

function textoDe(buffer: Buffer): string {
  const xml = new PizZip(buffer).file("word/document.xml")!.asText();
  return xml.replace(/<[^>]+>/g, "");
}

describe("analizarDocx", () => {
  it("extrae párrafos y detecta huecos de todos los tipos", () => {
    const buf = docx([
      ["Nombre del oferente: ________"],
      ["RNC: [indicar el número de RNC]"],
      ["Total: ……………………"],
      ["Ya taggeado: {rnc}"],
    ]);
    const { parrafos, huecos } = analizarDocx(buf);
    expect(parrafos).toHaveLength(4);
    expect(huecos.map((h) => h.tipo)).toEqual(["subrayado", "instruccion", "puntos", "tag"]);
    expect(huecos[1].texto).toBe("[indicar el número de RNC]");
  });

  it("detecta un hueco aunque Word lo parta en varios runs", () => {
    const buf = docx([["Nombre: __", "____", "__ final"]]);
    const { parrafos, huecos } = analizarDocx(buf);
    expect(parrafos[0].texto).toBe("Nombre: ________ final");
    expect(huecos).toHaveLength(1);
    expect(huecos[0]).toMatchObject({ inicio: 8, fin: 16, tipo: "subrayado" });
  });
});

describe("analizarDocx con XML hostil (formularios reales)", () => {
  it("no confunde <w:tab>, <w:tc> ni <w:tbl> con texto", () => {
    // Un párrafo con tabs y una tabla al lado — el bug real del MICM.
    const zip = new PizZip();
    zip.file("[Content_Types].xml", "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"/>");
    zip.file(
      "word/document.xml",
      `<w:document xmlns:w="x"><w:body>` +
        `<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="6267"/></w:tabs></w:pPr>` +
        `<w:r><w:t>Nombre: ______</w:t></w:r></w:p>` +
        `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>celda</w:t></w:r></w:p></w:tc></w:tr></w:tbl>` +
        `</w:body></w:document>`,
    );
    const { parrafos } = analizarDocx(zip.generate({ type: "nodebuffer" }));
    expect(parrafos.map((p) => p.texto)).toEqual(["Nombre: ______", "celda"]);
    // ni rastro de XML en el texto
    expect(parrafos.every((p) => !p.texto.includes("<"))).toBe(true);
  });

  it("oculta las copias de compatibilidad (mc:Fallback)", () => {
    const zip = new PizZip();
    zip.file("[Content_Types].xml", "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"/>");
    zip.file(
      "word/document.xml",
      `<w:document xmlns:w="x" xmlns:mc="y"><w:body>` +
        `<w:p><w:r><w:t>visible ____</w:t></w:r></w:p>` +
        `<mc:Fallback><w:p><w:r><w:t>duplicado ____</w:t></w:r></w:p></mc:Fallback>` +
        `</w:body></w:document>`,
    );
    const { parrafos, huecos } = analizarDocx(zip.generate({ type: "nodebuffer" }));
    expect(parrafos[0].oculto).toBeUndefined();
    expect(parrafos[1].oculto).toBe(true);
    // los huecos solo salen del contenido visible
    expect(huecos).toHaveLength(1);
    expect(huecos[0].parrafo).toBe(0);
  });
});

describe("aplicarAsignaciones", () => {
  it("reemplaza un tramo que cruza varios runs", () => {
    const buf = docx([["Nombre: __", "____", "__ final"]]);
    const out = aplicarAsignaciones(buf, [
      { parrafo: 0, inicio: 8, fin: 16, variable: "empresa_nombre" },
    ]);
    expect(textoDe(out)).toBe("Nombre: {empresa_nombre} final");
  });

  it("varias asignaciones en el mismo párrafo", () => {
    const buf = docx([["RNC: ______ y RPE: ______"]]);
    const out = aplicarAsignaciones(buf, [
      { parrafo: 0, inicio: 5, fin: 11, variable: "rnc" },
      { parrafo: 0, inicio: 19, fin: 25, variable: "rpe" },
    ]);
    expect(textoDe(out)).toBe("RNC: {rnc} y RPE: {rpe}");
  });

  it("el dato no hereda el formato de la instrucción (rojo fuera)", () => {
    const buf = docx([["Nombre: ________"]]);
    const out = aplicarAsignaciones(buf, [
      { parrafo: 0, inicio: 8, fin: 16, variable: "empresa_nombre" },
    ]);
    const xml = new PizZip(out).file("word/document.xml")!.asText();
    const runConTag = xml.match(/<w:r\b[\s\S]*?\{empresa_nombre\}[\s\S]*?<\/w:r>/)?.[0] ?? "";
    expect(runConTag).not.toContain("w:color");
  });

  it("una variable de imagen agrega los seguros que LibreOffice exige", () => {
    const buf = docx([["Firma: ________"]]);
    const out = aplicarAsignaciones(buf, [
      { parrafo: 0, inicio: 7, fin: 15, variable: "firma" },
    ]);
    const zip = new PizZip(out);
    expect(textoDe(out)).toContain("{%firma}");
    expect(zip.file("[Content_Types].xml")!.asText()).toContain('Extension="png"');
    expect(zip.file("word/_rels/document.xml.rels")).toBeTruthy();
    expect(zip.file("word/document.xml")!.asText()).toContain("xmlns:wp=");
  });

  it("la plantilla producida rellena con docxtemplater (ida y vuelta)", () => {
    const buf = docx([["Señores ____________", "Referencia: [indicar expediente]"]]);
    const out = aplicarAsignaciones(buf, [
      { parrafo: 0, inicio: 8, fin: 20, variable: "entidad_nombre" },
      { parrafo: 0, inicio: 32, fin: 53, variable: "expediente" },
    ]);
    const doc = new Docxtemplater(new PizZip(out), { nullGetter: () => "" });
    doc.render({ entidad_nombre: "OGTIC", expediente: "CP-2026-0011" });
    expect(textoDe(doc.toBuffer())).toBe("Señores OGTICReferencia: CP-2026-0011");
  });

  it("acepta variables personalizadas vía clavesExtra", () => {
    const buf = docx([["Nacionalidad: ________"]]);
    const out = aplicarAsignaciones(
      buf,
      [{ parrafo: 0, inicio: 14, fin: 22, variable: "nacionalidad" }],
      ["nacionalidad"],
    );
    expect(textoDe(out)).toBe("Nacionalidad: {nacionalidad}");
    const doc = new Docxtemplater(new PizZip(out), { nullGetter: () => "" });
    doc.render({ nacionalidad: "dominicano" });
    expect(textoDe(doc.toBuffer())).toBe("Nacionalidad: dominicano");
  });

  it("rechaza variables desconocidas y párrafos inexistentes", () => {
    const buf = docx([["hola"]]);
    expect(() =>
      aplicarAsignaciones(buf, [{ parrafo: 0, inicio: 0, fin: 4, variable: "no_existe" }]),
    ).toThrow(/desconocida/);
    expect(() =>
      aplicarAsignaciones(buf, [{ parrafo: 9, inicio: 0, fin: 4, variable: "rnc" }]),
    ).toThrow(/no existe/);
  });
});

// ============================================================
// La CASCADA de variantes por entidad: para cada código gana la
// variante de la entidad del proceso; sin entidad (o sin
// variante), la genérica de la organización.
// ============================================================
describe("resolverPlantillas — variante de la entidad gana sobre la genérica", () => {
  const generica = { id: "g1", codigo: "DADM-FO-031", institucion_id: null };
  const varianteSalud = { id: "v1", codigo: "DADM-FO-031", institucion_id: "ent-salud" };
  const otraGenerica = { id: "g2", codigo: "MI-CARTA-X", institucion_id: null };
  const todas = [generica, varianteSalud, otraGenerica];

  it("proceso de la entidad con variante: usa SU versión", () => {
    const mapa = resolverPlantillas(todas, "ent-salud");
    expect(mapa.get("DADM-FO-031")?.id).toBe("v1");
    expect(mapa.get("MI-CARTA-X")?.id).toBe("g2"); // sin variante → genérica
  });

  it("proceso de OTRA entidad: la variante ajena no contamina", () => {
    const mapa = resolverPlantillas(todas, "ent-itla");
    expect(mapa.get("DADM-FO-031")?.id).toBe("g1");
  });

  it("proceso sin entidad: solo genéricas", () => {
    const mapa = resolverPlantillas(todas, null);
    expect(mapa.get("DADM-FO-031")?.id).toBe("g1");
    expect(mapa.size).toBe(2);
  });

  it("solo existe la variante (sin genérica): responde únicamente a su entidad", () => {
    const solas = [varianteSalud];
    expect(resolverPlantillas(solas, "ent-salud").get("DADM-FO-031")?.id).toBe("v1");
    expect(resolverPlantillas(solas, "ent-itla").has("DADM-FO-031")).toBe(false);
    expect(resolverPlantillas(solas, null).has("DADM-FO-031")).toBe(false);
  });

  it("el orden de llegada no importa: la variante gana aunque venga primero", () => {
    const mapa = resolverPlantillas([varianteSalud, generica], "ent-salud");
    expect(mapa.get("DADM-FO-031")?.id).toBe("v1");
  });
});
