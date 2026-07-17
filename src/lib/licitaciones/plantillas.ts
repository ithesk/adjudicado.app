// El motor del constructor de plantillas: analiza un .docx subido (párrafos
// + huecos detectados) y aplica las asignaciones del editor produciendo la
// plantilla taggeada. Port a TypeScript del reemplazo quirúrgico probado en
// scripts/taggear-plantillas.py — con los seguros de Word que ya pagamos:
// el texto vive partido en "runs" arbitrarios y la edición se reparte entre
// ellos conservando el formato de cada tramo.
//
// SOLO SERVIDOR (manipula el zip del docx).

import PizZip from "pizzip";
import { tagDeVariable, variablePorClave, type Asignacion } from "./variables";

// ---------- entidades XML ----------

function decodificar(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

function codificar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------- párrafos (con conteo de profundidad: los cuadros de texto
// anidan w:p dentro de w:p y un regex no-goloso corrompería el documento) ----------

interface SpanParrafo {
  inicio: number; // índice en el XML
  fin: number;
}

function spansDeParrafos(xml: string): SpanParrafo[] {
  const spans: SpanParrafo[] = [];
  const re = /<w:p\b[^>]*?(\/)?>|<\/w:p>/g;
  let profundidad = 0;
  let abierto = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[0].startsWith("</")) {
      profundidad--;
      if (profundidad === 0 && abierto >= 0) {
        spans.push({ inicio: abierto, fin: m.index + m[0].length });
        abierto = -1;
      }
    } else if (m[1] === "/") {
      // <w:p/> auto-cerrado: párrafo vacío
      if (profundidad === 0) spans.push({ inicio: m.index, fin: m.index + m[0].length });
    } else {
      if (profundidad === 0) abierto = m.index;
      profundidad++;
    }
  }
  return spans;
}

// ---------- los w:t de un párrafo, con posiciones ----------

interface TramoTexto {
  xmlInicio: number; // posición del contenido del w:t dentro del XML del párrafo
  xmlFin: number;
  attrsInicio: number; // dónde insertar xml:space si falta
  attrs: string;
  texto: string; // decodificado
}

function tramosDeTexto(parrafoXml: string): TramoTexto[] {
  const tramos: TramoTexto[] = [];
  // (?=[\s/>]) — el nombre del tag TERMINA ahí: sin esto, <w:tab>, <w:tc> y
  // <w:tbl> se tragan XML entero como si fuera texto del documento.
  const re = /<w:t(?=[\s/>])([^>]*?)(\/)?>(?:([\s\S]*?)<\/w:t>)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(parrafoXml))) {
    if (m[2] === "/") {
      tramos.push({
        xmlInicio: m.index + m[0].length,
        xmlFin: m.index + m[0].length,
        attrsInicio: m.index + 4 + m[1].length,
        attrs: m[1],
        texto: "",
      });
    } else {
      const contenidoInicio = m.index + `<w:t${m[1]}>`.length;
      tramos.push({
        xmlInicio: contenidoInicio,
        xmlFin: contenidoInicio + (m[3] ?? "").length,
        attrsInicio: m.index + 4 + m[1].length,
        attrs: m[1],
        texto: decodificar(m[3] ?? ""),
      });
    }
  }
  return tramos;
}

function textoDeParrafo(parrafoXml: string): string {
  return tramosDeTexto(parrafoXml).map((t) => t.texto).join("");
}

// ---------- análisis: párrafos + huecos detectados ----------

export interface ParrafoAnalizado {
  indice: number;
  texto: string;
  /** Copia de compatibilidad (mc:Fallback): existe pero el editor la oculta. */
  oculto?: boolean;
}

function rangosFallback(xml: string): [number, number][] {
  const rangos: [number, number][] = [];
  const re = /<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) rangos.push([m.index, m.index + m[0].length]);
  return rangos;
}

export interface Hueco {
  parrafo: number;
  inicio: number;
  fin: number;
  tipo: "subrayado" | "instruccion" | "puntos" | "control" | "tag";
  texto: string;
}

const PATRONES_HUECO: [RegExp, Hueco["tipo"]][] = [
  [/_{4,}/g, "subrayado"],
  [/\[[^\]\n]{6,}\]/g, "instruccion"],
  [/(?:…[\s.]*){3,}|\.{8,}/g, "puntos"],
  [/Click here to enter text\.?/g, "control"],
  [/Seleccione la fecha ?/g, "control"],
  [/\{%?[\w]+\}/g, "tag"],
];

export function analizarDocx(buffer: Buffer): {
  parrafos: ParrafoAnalizado[];
  huecos: Hueco[];
} {
  const zip = new PizZip(buffer);
  const xml = zip.file("word/document.xml")?.asText();
  if (!xml) throw new Error("El archivo no es un .docx válido (sin word/document.xml).");

  const parrafos: ParrafoAnalizado[] = [];
  const huecos: Hueco[] = [];
  const fallback = rangosFallback(xml);
  spansDeParrafos(xml).forEach((span, indice) => {
    const texto = textoDeParrafo(xml.slice(span.inicio, span.fin));
    const oculto = fallback.some(([i, f]) => span.inicio >= i && span.fin <= f);
    parrafos.push(oculto ? { indice, texto, oculto } : { indice, texto });
    if (oculto) return; // sin huecos en las copias: no se asigna sobre ellas
    for (const [patron, tipo] of PATRONES_HUECO) {
      patron.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = patron.exec(texto))) {
        huecos.push({ parrafo: indice, inicio: m.index, fin: m.index + m[0].length, tipo, texto: m[0] });
      }
    }
  });
  // Sin solapes entre huecos del mismo párrafo (gana el primero detectado).
  huecos.sort((a, b) => a.parrafo - b.parrafo || a.inicio - b.inicio);
  const limpios: Hueco[] = [];
  for (const h of huecos) {
    const previo = limpios.at(-1);
    if (previo && previo.parrafo === h.parrafo && h.inicio < previo.fin) continue;
    limpios.push(h);
  }
  return { parrafos, huecos: limpios };
}

// ---------- aplicar una asignación dentro de un párrafo ----------

function aplicarEnParrafo(parrafoXml: string, inicio: number, fin: number, tag: string): string {
  const tramos = tramosDeTexto(parrafoXml);
  // Ediciones de derecha a izquierda para no invalidar posiciones XML.
  const ediciones: { desde: number; hasta: number; texto: string; attrsInicio: number; attrs: string }[] = [];
  let pos = 0;
  let puesto = false;
  for (const t of tramos) {
    const tIni = pos;
    const tFin = pos + t.texto.length;
    pos = tFin;
    if (tFin <= inicio || tIni >= fin) continue;
    const antes = t.texto.slice(0, Math.max(0, inicio - tIni));
    const despues = t.texto.slice(Math.max(0, Math.min(t.texto.length, fin - tIni)));
    const nuevo = antes + (puesto ? "" : tag) + despues;
    ediciones.push({ desde: t.xmlInicio, hasta: t.xmlFin, texto: codificar(nuevo), attrsInicio: t.attrsInicio, attrs: t.attrs });
    puesto = true;
  }
  let xml = parrafoXml;
  for (const e of ediciones.reverse()) {
    xml = xml.slice(0, e.desde) + e.texto + xml.slice(e.hasta);
    if (!/xml:space=/.test(e.attrs)) {
      xml = xml.slice(0, e.attrsInicio) + ' xml:space="preserve"' + xml.slice(e.attrsInicio);
    }
  }
  return xml;
}

// El dato no debe heredar el formato de la instrucción (rojo/cursiva).
function limpiarFormatoDeTags(parrafoXml: string): string {
  return parrafoXml.replace(/<w:r\b[\s\S]*?<\/w:r>/g, (run) => {
    if (!/[{]/.test(decodificar(run))) return run;
    return run
      .replace(/<w:color [^/]*\/>/g, "")
      .replace(/<w:i\/>/g, "")
      .replace(/<w:iCs\/>/g, "")
      .replace(/<w:highlight [^/]*\/>/g, "");
  });
}

// ---------- soporte de imágenes (los seguros que LibreOffice exige) ----------

const NAMESPACES_DIBUJO: [string, string][] = [
  ["xmlns:r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships"],
  ["xmlns:wp", "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"],
  ["xmlns:a", "http://schemas.openxmlformats.org/drawingml/2006/main"],
  ["xmlns:pic", "http://schemas.openxmlformats.org/drawingml/2006/picture"],
];

function asegurarSoporteImagenes(zip: PizZip): void {
  // 1) Content types de png/jpeg
  const ctPath = "[Content_Types].xml";
  let ct = zip.file(ctPath)?.asText() ?? "";
  for (const [ext, tipo] of [["png", "image/png"], ["jpeg", "image/jpeg"], ["jpg", "image/jpeg"]]) {
    if (!new RegExp(`Extension="${ext}"`).test(ct)) {
      ct = ct.replace("</Types>", `<Default Extension="${ext}" ContentType="${tipo}"/></Types>`);
    }
  }
  zip.file(ctPath, ct);
  // 2) El archivo de relaciones del documento debe existir
  if (!zip.file("word/_rels/document.xml.rels")) {
    zip.file(
      "word/_rels/document.xml.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>',
    );
  }
  // 3) Los namespaces del dibujo en la raíz
  let doc = zip.file("word/document.xml")!.asText();
  const raiz = doc.match(/<w:document\b[^>]*>/);
  if (raiz) {
    let tag = raiz[0];
    for (const [pref, uri] of NAMESPACES_DIBUJO) {
      if (!tag.includes(`${pref}=`)) tag = tag.replace(/>$/, ` ${pref}="${uri}">`);
    }
    if (tag !== raiz[0]) {
      doc = doc.replace(raiz[0], tag);
      zip.file("word/document.xml", doc);
    }
  }
}

// ---------- aplicar todas las asignaciones ----------

export function aplicarAsignaciones(
  buffer: Buffer,
  asignaciones: Asignacion[],
  clavesExtra: string[] = [],
): Buffer {
  const zip = new PizZip(buffer);
  let xml = zip.file("word/document.xml")?.asText();
  if (!xml) throw new Error("El archivo no es un .docx válido.");

  // Por párrafo, de derecha a izquierda (posiciones estables); los párrafos
  // de atrás hacia adelante (los spans XML no se invalidan entre sí).
  const porParrafo = new Map<number, Asignacion[]>();
  const extra = new Set(clavesExtra);
  for (const a of asignaciones) {
    if (!variablePorClave(a.variable) && !extra.has(a.variable))
      throw new Error(`Variable desconocida: ${a.variable}`);
    porParrafo.set(a.parrafo, [...(porParrafo.get(a.parrafo) ?? []), a]);
  }

  const spans = spansDeParrafos(xml);
  const indices = [...porParrafo.keys()].sort((x, y) => y - x);
  for (const indice of indices) {
    const span = spans[indice];
    if (!span) throw new Error(`El párrafo ${indice} no existe en el documento.`);
    let parrafoXml: string = xml.slice(span.inicio, span.fin);
    const lista = porParrafo.get(indice)!.sort((x, y) => y.inicio - x.inicio);
    for (const a of lista) {
      const tag = variablePorClave(a.variable) ? tagDeVariable(a.variable) : `{${a.variable}}`;
      parrafoXml = aplicarEnParrafo(parrafoXml, a.inicio, a.fin, tag);
    }
    parrafoXml = limpiarFormatoDeTags(parrafoXml);
    xml = xml.slice(0, span.inicio) + parrafoXml + xml.slice(span.fin);
  }
  zip.file("word/document.xml", xml);

  if (asignaciones.some((a) => variablePorClave(a.variable)?.imagen)) {
    asegurarSoporteImagenes(zip);
  }
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}
