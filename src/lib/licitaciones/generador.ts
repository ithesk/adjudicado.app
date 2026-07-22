// El motor documental (Fase 4): del expediente canónico validado a los
// formularios oficiales rellenados. SOLO SERVIDOR (lee plantillas del disco).
//
// Regla de fidelidad: se rellenan las plantillas -tpl (los .docx oficiales de
// la DGCP con marcadores), nunca se regenera un formato propio.

import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";
import { enteroALetras, montoALetras } from "./letras";
import type { ProcesoCanonico } from "./contrato";

const DIR_PLANTILLAS = path.join(process.cwd(), "plantillas");

// Qué requisito del checklist se genera con qué plantilla. "dgcp" = formato
// oficial intocable; "cartas" = cartas propias de la empresa.
export const GENERABLES: Record<string, { plantilla: string; carpeta: string; nombre: string }> = {
  "SNCC.F.034": {
    plantilla: "SNCC_F034_Presentacion_de_Oferta-tpl.docx",
    carpeta: "dgcp",
    nombre: "Presentación de Oferta",
  },
  "SNCC.F.042": {
    plantilla: "SNCC_F042_Informacion_Oferente-tpl.docx",
    carpeta: "dgcp",
    nombre: "Información sobre el Oferente",
  },
  "SNCC.F.033": {
    plantilla: "SNCC_F033_Of_Economica-tpl.docx",
    carpeta: "dgcp",
    nombre: "Oferta Económica",
  },
  "COMP-ETICO": {
    plantilla: "Compromiso_Etico_Proveedores-tpl.docx",
    carpeta: "dgcp",
    nombre: "Compromiso Ético de Proveedores",
  },
  "SNCC.F.040": {
    plantilla: "SNCC_F040_Debida_Diligencia-tpl.docx",
    carpeta: "dgcp",
    nombre: "Debida Diligencia y Conflicto de Interés",
  },
  "DJ-ART38": {
    plantilla: "DJ-ART38-tpl.docx",
    carpeta: "cartas",
    nombre: "Declaración jurada art. 38",
  },
  "CARTA-COND": {
    plantilla: "CARTA-COND-tpl.docx",
    carpeta: "cartas",
    nombre: "Aceptación de condiciones",
  },
  "DJ-COLUSION": {
    plantilla: "DJ-COLUSION-tpl.docx",
    carpeta: "cartas",
    nombre: "Declaración de no colusión",
  },
};

// Imágenes de la empresa: firma, sello y logo (el membrete de las cartas
// timbradas). Si no están cargadas, el tag no pinta nada: el documento sale
// igual, firmable a mano.
//
// OJO con el contrato del módulo: el VALOR del tag debe ser un string clave
// (no el Buffer — un objeto lo confunde con su modo asíncrono y revienta);
// getImage traduce la clave al buffer, y un valor vacío no renderiza nada.
export interface ImagenesFirma {
  firma?: Buffer | null;
  sello?: Buffer | null;
  logo?: Buffer | null;
  // Logo de la institución contratante (lo pide el F.040 en su cabecera).
  logo_institucion?: Buffer | null;
}

// Ancho×alto reales de un PNG (IHDR) o JPEG (marcador SOF). Los logos
// vienen en cualquier proporción — estirarlos a una caja fija los deforma.
function dimensionesImagen(buf: Buffer): { ancho: number; alto: number } | null {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { ancho: buf.readUInt32BE(16), alto: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marcador = buf[i + 1];
      if (marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc) {
        return { ancho: buf.readUInt16BE(i + 7), alto: buf.readUInt16BE(i + 5) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

// Cada logo se escala a su caja conservando la proporción.
function tamanoEnCaja(
  buf: Buffer,
  maxAncho: number,
  maxAlto: number,
  porDefecto: [number, number],
): [number, number] {
  const dim = dimensionesImagen(buf);
  if (!dim || dim.ancho <= 0 || dim.alto <= 0) return porDefecto;
  const escala = Math.min(maxAncho / dim.ancho, maxAlto / dim.alto);
  return [Math.round(dim.ancho * escala), Math.round(dim.alto * escala)];
}

// Qué imagen es DE VERDAD, por sus primeros bytes (la extensión miente).
function formatoRealDeImagen(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  if (buf.toString("ascii", 0, 4) === "GIF8") return "gif";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP")
    return "webp";
  return null;
}

// El módulo free de imágenes guarda TODO lo que inserta como .png aunque el
// buffer sea un JPEG (caso real: el logo .jpg de una entidad). Word lo
// perdona; el LibreOffice de Gotenberg NO — pinta la imagen pero DESCARTA el
// texto de esa página (el F.040 salía con los campos «borrados» en PDF).
// Después del render, cada media cuyo formato real no coincide con su
// extensión se renombra, y se re-apuntan relaciones y content-types.
export function corregirExtensionesDeMedia(zip: PizZip): void {
  const renombres = new Map<string, string>();
  for (const nombre of Object.keys(zip.files)) {
    const m = nombre.match(/^word\/media\/(.+)\.(png|jpe?g|gif|webp)$/i);
    if (!m) continue;
    const buf = zip.file(nombre)!.asNodeBuffer();
    const real = formatoRealDeImagen(buf);
    const declarada = m[2].toLowerCase().replace(/^jpg$/, "jpeg");
    if (!real || real === declarada) continue;
    zip.file(`word/media/${m[1]}.${real}`, buf);
    zip.remove(nombre);
    renombres.set(`media/${m[1]}.${m[2]}`, `media/${m[1]}.${real}`);
  }
  if (renombres.size === 0) return;
  for (const nombre of Object.keys(zip.files)) {
    if (!nombre.endsWith(".rels")) continue;
    let xml = zip.file(nombre)!.asText();
    let cambio = false;
    for (const [viejo, nuevo] of renombres) {
      if (xml.includes(viejo)) {
        xml = xml.split(viejo).join(nuevo);
        cambio = true;
      }
    }
    if (cambio) zip.file(nombre, xml);
  }
  const MIME: Record<string, string> = {
    png: "image/png",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
  };
  let tipos = zip.file("[Content_Types].xml")!.asText();
  const nuevasExt = new Set(
    Array.from(renombres.values()).map((v) => v.slice(v.lastIndexOf(".") + 1)),
  );
  for (const ext of nuevasExt) {
    if (!new RegExp(`Extension="${ext}"`, "i").test(tipos)) {
      tipos = tipos.replace(
        "</Types>",
        `<Default Extension="${ext}" ContentType="${MIME[ext]}"/></Types>`,
      );
    }
  }
  zip.file("[Content_Types].xml", tipos);
}

function moduloImagenes(imagenes: ImagenesFirma) {
  return new ImageModule({
    centered: false,
    getImage: (clave) =>
      (clave === "sello"
        ? imagenes.sello
        : clave === "logo"
          ? imagenes.logo
          : clave === "logo_institucion"
            ? imagenes.logo_institucion
            : imagenes.firma) as Buffer,
    getSize: (img, clave) =>
      clave === "sello"
        ? [110, 110]
        : clave === "logo"
          ? tamanoEnCaja(img as Buffer, 190, 60, [160, 55])
          : clave === "logo_institucion"
            // La caja del F.040 es un cuadrado de ~2.2 cm en la cabecera.
            ? tamanoEnCaja(img as Buffer, 85, 85, [80, 80])
            : [170, 60],
  });
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre",
];

function fechaLarga(d = new Date()): string {
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

// Formato es-DO (1,234.56) determinista, sin depender del ICU del entorno.
function num(n: number): string {
  const [ent, dec] = n.toFixed(2).split(".");
  return `${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${dec}`;
}

// Construye el objeto de datos que docxtemplater inyecta. Regla dura: el
// MAPPER formatea (números como texto es-DO), la plantilla no calcula nada.
export function construirDatos(canonico: ProcesoCanonico): Record<string, unknown> {
  const gg =
    canonico.firmantes.find((f) => f.rol === "gerente_general") ??
    canonico.firmantes[0];

  const items = canonico.lotes.flatMap((l) => l.items);
  let totalOferta = 0;
  const lineas = (canonico.economico?.lineas ?? []).map((linea) => {
    const item = items.find((i) => i.numero === linea.item);
    const subtotal = Math.round(linea.precio_unitario * (item?.cantidad ?? 1) * 100) / 100;
    const itbis = linea.itbis_aplica
      ? Math.round(((subtotal * (canonico.economico?.itbis_pct ?? 18)) / 100) * 100) / 100
      : 0;
    totalOferta = Math.round((totalOferta + subtotal + itbis) * 100) / 100;
    return {
      numero: linea.item,
      // LO OFERTADO manda: marca + modelo + descripción (como se estila en
      // una oferta económica). Sin producto completo, la spec del pliego.
      descripcion: item?.producto
        ? `${item.producto.marca} ${item.producto.modelo} — ${item.producto.descripcion}`
        : item?.spec_cruda ?? "",
      unidad: item?.unidad ?? "UD",
      cantidad: num(item?.cantidad ?? 1).replace(/\.00$/, ""),
      precio_unitario: num(linea.precio_unitario),
      itbis_monto: num(itbis),
      total: num(subtotal + itbis),
    };
  });

  return {
    // Identidad del proceso
    expediente: canonico.proceso.codigo,
    fecha: fechaLarga(),
    entidad_nombre: canonico.proceso.entidad.nombre,
    unidad_funcional: "",
    // La empresa (snapshot del canónico)
    empresa_nombre: canonico.oferente.razon_social,
    rnc: canonico.oferente.rnc,
    rpe: canonico.oferente.rpe,
    empresa_direccion: canonico.oferente.direccion,
    empresa_telefono: canonico.oferente.telefono,
    empresa_email: canonico.oferente.email,
    // Firmante (el GG firma la presentación y la económica)
    rep_nombre: gg?.nombre ?? "",
    rep_cargo: gg?.cargo ?? "",
    rep_cedula: gg?.cedula ?? "",
    rep_direccion: canonico.oferente.direccion,
    // Compromiso Ético (los que no capturamos quedan en blanco, se llenan a mano)
    rep_nacionalidad: "dominicana",
    rep_estado_civil: "",
    ciudad: "Santo Domingo",
    provincia: "Distrito Nacional",
    objeto: canonico.proceso.objeto,
    dia_numero: String(new Date().getDate()),
    dia_letras: enteroALetras(new Date().getDate()).toLowerCase(),
    mes_letras: MESES[new Date().getMonth()],
    ano_letras: enteroALetras(new Date().getFullYear()).toLowerCase(),
    ano_numero: String(new Date().getFullYear()),
    // Cuerpo del F.034
    consorcio: "No aplica",
    enmiendas: "No aplica",
    bienes_descripcion:
      canonico.proceso.objeto ||
      items.filter((i) => i.ofertamos).map((i) => i.spec_cruda).join("; "),
    // La económica
    lineas,
    total_oferta: num(totalOferta),
    total_letras: montoALetras(totalOferta),
    // F.040: procesos ya adjudicados a la empresa (los aporta el route como
    // extra; el default vacío elimina la fila-bucle sin dejar tags sueltos).
    adjudicados: [],
  };
}

export interface DocGenerado {
  codigo: string;
  nombre: string;
  archivo: string; // nombre de archivo propuesto
  buffer: Buffer;
}

// El módulo de imágenes (free) solo renderiza UN tag de imagen por run: con
// "{%firma} {%sello}" en el mismo run, el segundo se consume sin pintar nada
// (así se perdía el sello del F.033 y de las cartas). Antes de rellenar,
// cada tag de imagen se aísla en su propio run conservando el formato.
export function separarTagsDeImagen(xml: string): string {
  return xml.replace(
    /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g,
    (run: string, contenido: string) => {
      // Solo runs simples: rPr opcional + una única w:t. Cualquier otra
      // estructura se deja intacta.
      const m = contenido.match(
        /^\s*(<w:rPr>[\s\S]*?<\/w:rPr>)?\s*<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>\s*$/,
      );
      if (!m) return run;
      const [, rPr = "", texto] = m;
      const partes = texto.split(/(\{%[^}]+\})/).filter((p) => p !== "");
      const imagenes = partes.filter((p) => /^\{%[^}]+\}$/.test(p)).length;
      if (imagenes === 0 || partes.length === 1) return run;
      return partes
        .map((p) => `<w:r>${rPr}<w:t xml:space="preserve">${p}</w:t></w:r>`)
        .join("");
    },
  );
}

// Rellena CUALQUIER plantilla taggeada (del repo o del constructor de la
// organización) con un objeto de datos.
export function rellenarPlantilla(
  plantilla: Buffer,
  datos: Record<string, unknown>,
  imagenes: ImagenesFirma = {},
): Buffer {
  const zip = new PizZip(plantilla);
  for (const nombre of Object.keys(zip.files)) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(nombre)) continue;
    const xml = zip.file(nombre)!.asText();
    if (xml.includes("{%")) zip.file(nombre, separarTagsDeImagen(xml));
  }
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
    modules: [moduloImagenes(imagenes)],
  });
  doc.render({
    ...datos,
    firma: imagenes.firma ? "firma" : "",
    sello: imagenes.sello ? "sello" : "",
    logo: imagenes.logo ? "logo" : "",
    logo_institucion: imagenes.logo_institucion ? "logo_institucion" : "",
  });
  corregirExtensionesDeMedia(doc.getZip() as PizZip);
  return doc.toBuffer();
}

// Una plantilla del CONSTRUCTOR (la subió la organización, vive en storage).
export function generarDesdeBuffer(
  codigo: string,
  nombre: string,
  plantilla: Buffer,
  canonico: ProcesoCanonico,
  imagenes: ImagenesFirma = {},
  // Variables personalizadas: valores fijos de la plantilla + los capturados
  // en el requisito de este proceso (+ datos de sistema como "adjudicados").
  extra: Record<string, unknown> = {},
): DocGenerado {
  return {
    codigo,
    nombre,
    archivo: `${codigo.replace(/[^\w-]+/g, "_")}_${canonico.proceso.codigo.replace(/[^\w-]+/g, "-")}.docx`,
    buffer: rellenarPlantilla(plantilla, { ...construirDatos(canonico), ...extra }, imagenes),
  };
}

export function generarDocumento(
  codigo: string,
  canonico: ProcesoCanonico,
  imagenes: ImagenesFirma = {},
  extra: Record<string, unknown> = {},
): DocGenerado {
  const def = GENERABLES[codigo];
  if (!def) throw new Error(`No hay plantilla para ${codigo}`);
  const plantilla = fs.readFileSync(path.join(DIR_PLANTILLAS, def.carpeta, def.plantilla));
  return {
    codigo,
    nombre: def.nombre,
    archivo: `${codigo.replace(/\./g, "_")}_${canonico.proceso.codigo.replace(/[^\w-]+/g, "-")}.docx`,
    buffer: rellenarPlantilla(plantilla, { ...construirDatos(canonico), ...extra }, imagenes),
  };
}

// El paquete: cada formulario generado + un ZIP con todos.
export function generarPaquete(
  codigos: string[],
  canonico: ProcesoCanonico,
  imagenes: ImagenesFirma = {},
): { documentos: DocGenerado[]; zip: Buffer; zipNombre: string } {
  const documentos = codigos.map((c) => generarDocumento(c, canonico, imagenes));
  const zip = new PizZip();
  for (const d of documentos) zip.file(d.archivo, d.buffer);
  return {
    documentos,
    zip: zip.generate({ type: "nodebuffer", compression: "DEFLATE" }),
    zipNombre: `paquete_${canonico.proceso.codigo.replace(/[^\w-]+/g, "-")}_v${canonico.meta.version}.zip`,
  };
}
