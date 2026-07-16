import fs from "node:fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

const datos = {
  expediente: "OGTIC-CCC-CP-2026-0011",
  fecha: "16 de julio de 2026",
  entidad_nombre: "Oficina Gubernamental de Tecnologías de la Información",
  empresa_nombre: "Innovación Tecnológica SK, SRL",
  rnc: "1-31-12345-6", rpe: "12345",
  empresa_direccion: "Av. Winston Churchill, Santo Domingo",
  empresa_telefono: "809-555-0100", empresa_email: "licitaciones@sk.com.do",
  rep_nombre: "Pablo Holguín", rep_cargo: "Gerente General",
  rep_direccion: "Av. Winston Churchill, Santo Domingo",
  consorcio: "No aplica", enmiendas: "No aplica",
  bienes_descripcion: "Licencias informáticas según el pliego",
  total_oferta: "329,376.00",
  total_letras: "TRESCIENTOS VEINTINUEVE MIL TRESCIENTOS SETENTA Y SEIS PESOS DOMINICANOS CON 00/100",
  lineas: [
    { numero: 1, descripcion: "Licencia Adobe Acrobat Pro", unidad: "UD", cantidad: "15", precio_unitario: "16,200.00", itbis_monto: "0.00", total: "243,000.00" },
    { numero: 2, descripcion: "Licencia Claude Team (Anthropic)", unidad: "UD", cantidad: "5", precio_unitario: "14,640.00", itbis_monto: "0.00", total: "73,200.00" },
  ],
  fabricante_nombre_domicilio: "Adobe Inc., San José, California",
  fabricante_nombre: "Adobe Inc.", fabricante_bienes: "licencias de software",
  fabricante_bienes_detalle: "Adobe Acrobat Pro (plan equipos)",
  fabricante_rep_nombre: "—", fabricante_rep_cargo: "—",
  articulo_garantia: "12", dia_letras: "dieciséis (16)", mes_letras: "julio", ano_letras: "dos mil veintiséis (2026)",
};

let fallos = 0;
for (const f of ["SNCC_F034_Presentacion_de_Oferta", "SNCC_F042_Informacion_Oferente", "SNCC_F033_Of_Economica", "SNCC_F047_Autorizacion_Fabricante"]) {
  try {
    const zip = new PizZip(fs.readFileSync(`plantillas/dgcp/${f}-tpl.docx`));
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => "" });
    doc.render(datos);
    const out = doc.toBuffer();
    fs.writeFileSync(`${process.env.TMPDIR ?? "/tmp"}/${f}-RELLENO.docx`, out);
    console.log(`✓ ${f}: rellenado (${Math.round(out.length/1024)} KB)`);
  } catch (e) {
    fallos++;
    console.log(`✗ ${f}:`, e.message, JSON.stringify(e.properties?.errors?.slice(0,3).map(x => x.properties?.explanation) ?? []));
  }
}
process.exit(fallos ? 1 : 0);
