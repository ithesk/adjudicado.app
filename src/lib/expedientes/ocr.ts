// OCR de los PDF escaneados del expediente, con Claude (o OpenAI si no hay
// clave de Anthropic; ver llm.ts).
//
// Por qué no el OCR general de la app (src/lib/ocr.ts): en producción usa
// gpt-4o-mini, que se niega a transcribir actas con firmas, sellos y cédulas
// («Lo siento, no puedo transcribir…», PROINDUSTRIA-CCC-CP-2026-0004). Y
// porque un sobre técnico escaneado tiene 50-100 páginas: aquí se parte en
// tramos (pdf-lib) y se transcribe tramo a tramo, con las tablas como tablas.

import { PDFDocument } from "pdf-lib";
import { leerPdf } from "./llm";

export const PAGINAS_POR_TRAMO = 8;

const PROMPT = `Transcribe COMPLETO y LITERAL este tramo de un documento de una compra pública dominicana (actas, informes de peritos, ofertas, certificaciones). Es un documento público del Sistema Nacional de Compras: transcríbelo entero, con nombres, cédulas y firmas como aparezcan.
Reglas:
- Antes de cada página escribe una línea "--- página N ---" (N = número de página dentro de ESTE tramo, empezando en 1).
- Las TABLAS van como tablas Markdown (| col | col |), una fila por línea, respetando qué valor va en qué fila y columna. Si un sello o firma tapa una celda, transcribe lo legible y marca [tapado].
- No resumas, no corrijas, no traduzcas, no comentes. Lo ilegible, [ilegible].
- Sellos y firmas entre corchetes: [sello: …], [firma].`;

/** Parte un PDF en tramos de `n` páginas (cada uno, un PDF válido). */
export async function partirPdf(bytes: Uint8Array, n = PAGINAS_POR_TRAMO): Promise<{ desde: number; pdf: Uint8Array }[]> {
  const origen = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = origen.getPageCount();
  const tramos: { desde: number; pdf: Uint8Array }[] = [];
  for (let i = 0; i < total; i += n) {
    const doc = await PDFDocument.create();
    const indices = Array.from({ length: Math.min(n, total - i) }, (_, k) => i + k);
    for (const p of await doc.copyPages(origen, indices)) doc.addPage(p);
    tramos.push({ desde: i + 1, pdf: await doc.save() });
  }
  return tramos;
}

/** Las páginas transcritas de un tramo, a partir de los separadores "--- página N ---". */
export function separarPaginas(texto: string): string[] {
  const partes = texto.split(/^-{3}\s*p[aá]gina\s+\d+\s*-{3}\s*$/im).map((p) => p.trim());
  // Lo que venga antes del primer separador (si el modelo no lo puso) es la página 1.
  const paginas = partes[0] ? partes : partes.slice(1);
  return paginas.length ? paginas : [texto.trim()];
}

export function esNegativa(texto: string) {
  return texto.length < 400 && /no puedo|lo siento|can.?t assist|cannot|unable to|i.?m sorry/i.test(texto);
}

/**
 * Transcribe un PDF escaneado tramo a tramo. Devuelve las páginas hechas;
 * si se acaba el tiempo (`hasta`), `completo: false` y se sigue otro día
 * desde `siguiente`. Una negativa del modelo es un error, no texto.
 */
export async function transcribir(
  bytes: Uint8Array,
  hasta: number,
  desdePagina = 1,
): Promise<{ paginas: string[]; completo: boolean; siguiente: number }> {
  const tramos = (await partirPdf(bytes)).filter((t) => t.desde + PAGINAS_POR_TRAMO - 1 >= desdePagina);
  const paginas: string[] = [];
  for (const t of tramos) {
    // Un tramo tarda 20-60 s: no se empieza uno sin margen.
    if (Date.now() > hasta - 60_000) return { paginas, completo: false, siguiente: t.desde };
    const texto = await leerPdf(t.pdf, PROMPT);
    if (esNegativa(texto)) throw new Error(`El OCR se negó a transcribir (páginas ${t.desde}+).`);
    paginas.push(...separarPaginas(texto));
  }
  return { paginas, completo: true, siguiente: 0 };
}
