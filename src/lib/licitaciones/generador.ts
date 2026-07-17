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

// Imagen de firma y sello de la empresa. Si no están cargadas, el tag no
// pinta nada: el documento sale igual, firmable a mano.
//
// OJO con el contrato del módulo: el VALOR del tag debe ser un string clave
// (no el Buffer — un objeto lo confunde con su modo asíncrono y revienta);
// getImage traduce la clave al buffer, y un valor vacío no renderiza nada.
export interface ImagenesFirma {
  firma?: Buffer | null;
  sello?: Buffer | null;
}

function moduloImagenes(imagenes: ImagenesFirma) {
  return new ImageModule({
    centered: false,
    getImage: (clave) =>
      (clave === "sello" ? imagenes.sello : imagenes.firma) as Buffer,
    getSize: (_img, clave) => (clave === "sello" ? [110, 110] : [170, 60]),
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
      descripcion: item?.producto?.descripcion ?? item?.spec_cruda ?? "",
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
  };
}

export interface DocGenerado {
  codigo: string;
  nombre: string;
  archivo: string; // nombre de archivo propuesto
  buffer: Buffer;
}

// Rellena CUALQUIER plantilla taggeada (del repo o del constructor de la
// organización) con un objeto de datos.
export function rellenarPlantilla(
  plantilla: Buffer,
  datos: Record<string, unknown>,
  imagenes: ImagenesFirma = {},
): Buffer {
  const zip = new PizZip(plantilla);
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
  });
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
  // en el requisito de este proceso.
  extra: Record<string, string> = {},
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
): DocGenerado {
  const def = GENERABLES[codigo];
  if (!def) throw new Error(`No hay plantilla para ${codigo}`);
  const plantilla = fs.readFileSync(path.join(DIR_PLANTILLAS, def.carpeta, def.plantilla));
  return {
    codigo,
    nombre: def.nombre,
    archivo: `${codigo.replace(/\./g, "_")}_${canonico.proceso.codigo.replace(/[^\w-]+/g, "-")}.docx`,
    buffer: rellenarPlantilla(plantilla, construirDatos(canonico), imagenes),
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
