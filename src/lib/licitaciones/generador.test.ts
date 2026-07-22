import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import PizZip from "pizzip";
import { rellenarPlantilla, separarTagsDeImagen } from "./generador";

// PNG real de w×h (gris): para probar que el logo escala PROPORCIONAL.
function pngDe(w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const chunk = (tipo: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const cuerpo = Buffer.concat([Buffer.from(tipo), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(cuerpo), 0);
    return Buffer.concat([len, cuerpo, crc]);
  };
  const fila = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x88)]);
  const idat = zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => fila)));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

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

  it("el membrete lleva el logo escalado a su proporción real", () => {
    const tpl = fs.readFileSync(
      path.join(process.cwd(), "plantillas/cartas/CARTA-COND-tpl.docx"),
    );
    const out = rellenarPlantilla(
      tpl,
      {
        empresa_nombre: "ITHESK SRL",
        rnc: "1-31-00000-1",
        empresa_direccion: "Av. X #1",
        empresa_telefono: "809-000-0000",
        empresa_email: "info@ithesk.com",
      },
      { firma: pngDe(40, 20), sello: pngDe(40, 40), logo: pngDe(300, 120) },
    );
    expect(dibujos(out)).toBe(3); // logo + firma + sello
    // 300×120 con tope de alto 60px → 150×60; el módulo emite EMU (px·9525).
    const xml = new PizZip(out).file("word/document.xml")!.asText();
    expect(xml).toContain(String(150 * 9525));
    // Copia para la validación externa con textutil (¿Word la abre?).
    fs.writeFileSync(path.join(os.tmpdir(), "carta-timbrada-prueba.docx"), out);
  });

  it("sin logo cargado la carta sale igual (el tag no pinta nada)", () => {
    const tpl = fs.readFileSync(
      path.join(process.cwd(), "plantillas/cartas/DJ-ART38-tpl.docx"),
    );
    const out = rellenarPlantilla(tpl, {}, { firma: PNG, sello: PNG });
    expect(dibujos(out)).toBe(2);
    expect(new PizZip(out).file("word/document.xml")!.asText()).not.toContain("{%logo}");
  });
});

describe("el F.040 (debida diligencia y conflicto de interés)", () => {
  const tpl = () =>
    fs.readFileSync(
      path.join(process.cwd(), "plantillas/dgcp/SNCC_F040_Debida_Diligencia-tpl.docx"),
    );

  it("pinta el logo de la institución en su caja, la firma (dos veces) y el sello", () => {
    const out = rellenarPlantilla(
      tpl(),
      { entidad_nombre: "Ministerio de Turismo", adjudicados: [] },
      { firma: PNG, sello: PNG, logo_institucion: pngDe(400, 200) },
    );
    // logo institucional + firma en la tabla + firma y sello sobre la línea.
    expect(dibujos(out)).toBe(4);
    const xml = new PizZip(out).file("word/document.xml")!.asText();
    expect(xml).toContain("Ministerio de Turismo");
    expect(xml).not.toContain("{%logo_institucion}");
    // 400×200 en caja 85×85 → 85 de ancho, proporción intacta (EMU = px·9525).
    expect(xml).toContain(String(85 * 9525));
  });

  it("autollenado del historial: lista lo adjudicado y sin historial la fila desaparece", () => {
    const con = new PizZip(
      rellenarPlantilla(
        tpl(),
        {
          adjudicados: [
            { adj_codigo: "SIE-CCC-CP-2025-01", adj_institucion: "SIE", adj_objeto: "Tablets", adj_fecha: "01/02/2025" },
            { adj_codigo: "MITUR-CCC-CM-2025-07", adj_institucion: "MITUR", adj_objeto: "Impresoras", adj_fecha: "15/03/2025" },
          ],
        },
        {},
      ),
    ).file("word/document.xml")!.asText();
    expect(con).toContain("SIE-CCC-CP-2025-01");
    expect(con).toContain("MITUR-CCC-CM-2025-07");
    const sin = new PizZip(rellenarPlantilla(tpl(), { adjudicados: [] }, {}))
      .file("word/document.xml")!
      .asText();
    // ("adjudicados" a secas aparece en el TEXTO oficial del formulario —
    // lo que no debe quedar es ningún tag del bucle.)
    expect(sin).not.toContain("{#adjudicados}");
    expect(sin).not.toContain("adj_codigo");
  });

  it("sin logo de la entidad el formulario sale igual (espacio en blanco, ningún tag suelto)", () => {
    const out = rellenarPlantilla(tpl(), { adjudicados: [] }, { firma: PNG, sello: PNG });
    expect(dibujos(out)).toBe(3);
    expect(new PizZip(out).file("word/document.xml")!.asText()).not.toContain("{%");
  });
});
