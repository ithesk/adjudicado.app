// Texto legible de los documentos de un proceso (pliego, ficha técnica,
// formularios), para que Claude los lea a través del MCP. PDF con unpdf (JS
// puro, corre en Vercel), Word con pizzip y Excel con xlsx — las tres ya
// conviven en la app. Un PDF escaneado no trae texto: se dice, no se inventa.

import PizZip from "pizzip";
import * as XLSX from "xlsx";

export interface TextoDocumento {
  formato: "pdf" | "docx" | "xlsx" | "otro";
  /** Una entrada por página (PDF) u hoja (Excel); Word es una sola. */
  paginas: string[];
  /** PDF sin capa de texto (escaneado): hay que verlo como imagen. */
  escaneado: boolean;
}

function formatoDe(nombre: string, bytes: Uint8Array): TextoDocumento["formato"] {
  // %PDF al inicio manda sobre la extensión: el portal sirve "x.docx (2).pdf".
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  const ext = nombre.toLowerCase().split(".").pop() ?? "";
  if (["docx", "docm", "dotx"].includes(ext)) return "docx";
  if (["xlsx", "xlsm", "xls"].includes(ext)) return "xlsx";
  return "otro";
}

// Solo los runs de texto (<w:t>): quitar etiquetas a ciegas arrastra las
// coordenadas de los dibujos (wp:posOffset) y los códigos de campo
// ("PAGE \* MERGEFORMAT").
function textoDocx(bytes: Uint8Array): string {
  const xml = (new PizZip(bytes).file("word/document.xml")?.asText() ?? "")
    // Los cuadros de texto vienen dos veces (moderno + copia de respaldo).
    .replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, "");
  let salida = "";
  for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<\/w:p>|<\/w:tc>/g)) {
    if (m[1] !== undefined) salida += m[1];
    else if (m[0] === "<w:tab/>") salida += "\t";
    else if (m[0] === "</w:p>") salida += "\n";
    else salida += " | ";
  }
  return salida
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extraerTexto(nombre: string, bytes: Uint8Array): Promise<TextoDocumento> {
  const formato = formatoDe(nombre, bytes);
  if (formato === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    // Copia: pdf.js transfiere el ArrayBuffer y deja el original en 0 bytes
    // (y el OCR de un escaneado necesita el original después).
    const pdf = await getDocumentProxy(bytes.slice());
    const { text } = await extractText(pdf, { mergePages: false });
    const paginas = text.map((t) => t.replace(/[ \t]+\n/g, "\n").trim());
    const total = paginas.reduce((n, p) => n + p.length, 0);
    // Menos de ~40 caracteres por página = solo encabezados: escaneado.
    return { formato, paginas, escaneado: total < 40 * Math.max(1, paginas.length) };
  }
  if (formato === "docx") return { formato, paginas: [textoDocx(bytes)], escaneado: false };
  if (formato === "xlsx") {
    const libro = XLSX.read(bytes, { type: "array" });
    const paginas = libro.SheetNames.map(
      (h) => `### Hoja: ${h}\n${XLSX.utils.sheet_to_csv(libro.Sheets[h], { FS: " | ", blankrows: false })}`,
    );
    return { formato, paginas, escaneado: false };
  }
  return { formato, paginas: [], escaneado: false };
}

// Un tramo de páginas que quepa en `maxCaracteres`, para leer documentos
// largos en varias llamadas sin reventar el contexto de Claude.
export function tramo(
  doc: TextoDocumento,
  desde: number,
  maxCaracteres: number,
): { texto: string; desde: number; hasta: number; total: number } {
  const total = doc.paginas.length;
  const inicio = Math.min(Math.max(1, desde), Math.max(1, total));
  const partes: string[] = [];
  let usados = 0;
  let hasta = inicio - 1;
  for (let i = inicio - 1; i < total; i++) {
    const bloque = `\n--- página ${i + 1} de ${total} ---\n${doc.paginas[i]}`;
    if (partes.length > 0 && usados + bloque.length > maxCaracteres) break;
    partes.push(bloque.length > maxCaracteres ? bloque.slice(0, maxCaracteres) + "\n[…página truncada]" : bloque);
    usados += bloque.length;
    hasta = i + 1;
  }
  return { texto: partes.join("\n").trim(), desde: inicio, hasta, total };
}
