import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import { rellenarPlantilla, separarTagsDeImagen } from "./generador";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAYAAAD/Rn+7AAAAG0lEQVR42mP8z8Dwn4EIwDiqcFThqMJRhcQAAK2eNSHUS13tAAAAAElFTkSuQmCC",
  "base64",
);

function docxMinimo(cuerpo: string): Buffer {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/_rels/document.xml.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${cuerpo}</w:body></w:document>`,
  );
  return zip.generate({ type: "nodebuffer" });
}

function dibujos(buffer: Buffer): number {
  const xml = new PizZip(buffer).file("word/document.xml")!.asText();
  return (xml.match(/<w:drawing>/g) ?? []).length;
}

describe("separarTagsDeImagen", () => {
  it("aísla cada tag de imagen en su propio run, conservando el formato", () => {
    const xml =
      '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>{%firma} {%sello}</w:t></w:r></w:p>';
    const salida = separarTagsDeImagen(xml);
    expect(salida.match(/<w:r>/g)).toHaveLength(3); // firma, espacio, sello
    expect(salida.match(/<w:rPr><w:b\/><\/w:rPr>/g)).toHaveLength(3);
  });

  it("no toca runs sin tags de imagen ni estructuras complejas", () => {
    const simple = "<w:p><w:r><w:t>hola {rnc}</w:t></w:r></w:p>";
    expect(separarTagsDeImagen(simple)).toBe(simple);
    const complejo = "<w:p><w:r><w:br/><w:t>{%firma} x</w:t></w:r></w:p>";
    expect(separarTagsDeImagen(complejo)).toBe(complejo);
  });
});

describe("rellenarPlantilla con firma y sello en el mismo run", () => {
  it("renderiza AMBAS imágenes (el bug del módulo free se esquiva)", () => {
    const buf = docxMinimo(
      "<w:p><w:r><w:t>{%firma} {%sello}</w:t></w:r></w:p>",
    );
    const out = rellenarPlantilla(buf, {}, { firma: PNG, sello: PNG });
    expect(dibujos(out)).toBe(2);
  });

  it("el F.033 real sale con firma Y sello", () => {
    const tpl = fs.readFileSync(
      path.join(process.cwd(), "plantillas/dgcp/SNCC_F033_Of_Economica-tpl.docx"),
    );
    const base = dibujos(tpl);
    const out = rellenarPlantilla(
      tpl,
      { lineas: [], empresa_nombre: "X" },
      { firma: PNG, sello: PNG },
    );
    expect(dibujos(out)).toBe(base + 2);
  });

  it("las cartas salen timbradas (firma y sello)", () => {
    for (const carta of ["CARTA-COND-tpl.docx", "DJ-ART38-tpl.docx", "DJ-COLUSION-tpl.docx"]) {
      const tpl = fs.readFileSync(path.join(process.cwd(), "plantillas/cartas", carta));
      const out = rellenarPlantilla(tpl, {}, { firma: PNG, sello: PNG });
      expect(dibujos(out), carta).toBe(2);
    }
  });
});
