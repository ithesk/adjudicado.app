import * as XLSX from "xlsx";

/** Parser heurístico de listas de precios en Excel (portado de ListApp).
 *  Recorre todas las hojas, auto-detecta la fila de cabecera y las columnas
 *  SKU / descripción / precio, y fusiona las hojas deduplicando por SKU
 *  (gana la hoja más grande). Funciona tanto con hojas consolidadas estilo
 *  "DataSet" como con hojas por categoría. */

export interface FilaImportada {
  sku: string;
  descripcion: string | null;
  descripcion2: string | null;
  familia: string | null;
  categoria: string | null;
  precio: number | null;
  term_meses: number | null;
}

const SKU_KEYWORDS = ["sku", "part number", "part #", "part#", "código", "codigo", "item code", "model", "mpn", "p/n", "parte"];
const DESC_KEYWORDS = ["description", "descripción", "descripcion", "desc", "detalle", "producto", "item name"];
const PRICE_KEYWORDS = ["price", "precio", "msrp", "list", "lista", "cost", "costo", "usd"];
const FAMILY_KEYWORDS = ["family", "familia", "product family", "category", "categoría", "categoria", "group", "grupo", "línea", "linea"];
// Las hojas tipo changelog mezclan altas con SKUs eliminados/descontinuados —
// nunca importarlas como productos disponibles.
const SKIP_SHEET_PATTERNS = [/change/i, /removal/i, /deleted/i, /discontinu/i, /cambio/i, /histor/i, /index/i, /cover/i, /general info/i];

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function matchesAny(cell: string, keywords: string[]): boolean {
  return keywords.some((k) => cell === k || cell.includes(k));
}

function parsePrice(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[$,\s]/g, "").replace(/^US\$?/i, "");
    if (cleaned === "" || cleaned === "-") return null;
    const n = Number(cleaned);
    return isFinite(n) ? n : null;
  }
  return null;
}

export function extractTermMonths(sku: string, description: string): number | null {
  const m = sku.match(/-(12|24|36|48|60)$/);
  if (m) return Number(m[1]);
  const y = description.match(/\b([1-9])\s*(?:year|yr|año|ano)s?\b/i);
  if (y) return Number(y[1]) * 12;
  return null;
}

interface ColumnMap {
  headerRow: number;
  sku: number;
  desc: number[];
  price: number;
  family: number;
  category: number;
}

function detectColumns(rows: unknown[][]): ColumnMap | null {
  const scanLimit = Math.min(rows.length, 40);
  for (let r = 0; r < scanLimit; r++) {
    const row = rows[r];
    if (!row) continue;
    const cells = row.map(norm);
    let sku = -1, price = -1, family = -1, category = -1;
    const desc: number[] = [];
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c];
      if (!cell) continue;
      if (sku === -1 && matchesAny(cell, SKU_KEYWORDS)) sku = c;
      else if (desc.length < 2 && matchesAny(cell, DESC_KEYWORDS)) desc.push(c);
      else if (price === -1 && matchesAny(cell, PRICE_KEYWORDS) && !cell.includes("fx")) price = c;
      else if (family === -1 && matchesAny(cell, FAMILY_KEYWORDS)) family = c;
      else if (category === -1 && cell === "category") category = c;
    }
    if (sku !== -1 && price !== -1 && desc.length > 0) {
      return { headerRow: r, sku, desc, price, family, category };
    }
  }
  return null;
}

export interface ResultadoParseo {
  rows: FilaImportada[];
  effectiveDate: string | null;
  sheetsUsed: string[];
}

/** Devuelve la "Effective Date" más reciente de las primeras filas — las
 *  listas suelen mencionar la vigencia anterior y la actual. */
function detectEffectiveDate(rows: unknown[][]): string | null {
  const found: string[] = [];
  let fallback: string | null = null;
  for (const row of rows.slice(0, 20)) {
    if (!row) continue;
    for (const cell of row) {
      if (typeof cell !== "string") continue;
      const m = cell.match(/effective\s*(?:date)?[:\s]+(.{4,40})/i) ||
                cell.match(/vigen(?:te|cia)\s*(?:desde|a partir de)?[:\s]+(.{4,40})/i);
      if (m) {
        const d = new Date(m[1].trim());
        if (!isNaN(d.getTime())) found.push(d.toISOString().slice(0, 10));
        else if (!fallback) fallback = m[1].trim();
      }
    }
  }
  if (found.length > 0) return found.sort().at(-1)!;
  return fallback;
}

export function parseWorkbook(buffer: ArrayBuffer | Buffer): ResultadoParseo {
  const wb = XLSX.read(buffer, { type: "buffer" as const });
  let effectiveDate: string | null = null;

  interface SheetData { name: string; rows: FilaImportada[] }
  const parsedSheets: SheetData[] = [];

  for (const name of wb.SheetNames) {
    if (SKIP_SHEET_PATTERNS.some((p) => p.test(name))) continue;
    const ws = wb.Sheets[name];
    if (!ws || !ws["!ref"]) continue;
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    if (rows.length < 2) continue;

    if (!effectiveDate) effectiveDate = detectEffectiveDate(rows);

    const cols = detectColumns(rows);
    if (!cols) continue;

    const out: FilaImportada[] = [];
    for (let r = cols.headerRow + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;
      const sku = String(row[cols.sku] ?? "").trim();
      if (!sku || sku.length > 80) continue;
      const precio = parsePrice(row[cols.price]);
      if (precio === null) continue;
      const descripcion = String(row[cols.desc[0]] ?? "").trim() || null;
      const descripcion2 = cols.desc[1] !== undefined
        ? String(row[cols.desc[1]] ?? "").trim() || null
        : null;
      const familia = cols.family !== -1
        ? String(row[cols.family] ?? "").trim() || name
        : name;
      const categoria = cols.category !== -1
        ? String(row[cols.category] ?? "").trim() || null
        : null;
      out.push({
        sku,
        descripcion,
        descripcion2,
        familia,
        categoria,
        precio,
        term_meses: extractTermMonths(sku, `${descripcion ?? ""} ${descripcion2 ?? ""}`),
      });
    }
    if (out.length > 0) parsedSheets.push({ name, rows: out });
  }

  // Fusión: la hoja más grande primero, dedup por SKU — así las hojas
  // consolidadas ganan sobre los duplicados por categoría.
  parsedSheets.sort((a, b) => b.rows.length - a.rows.length);
  const seen = new Set<string>();
  const merged: FilaImportada[] = [];
  const sheetsUsed: string[] = [];
  for (const sheet of parsedSheets) {
    let used = false;
    for (const row of sheet.rows) {
      if (seen.has(row.sku)) continue;
      seen.add(row.sku);
      merged.push(row);
      used = true;
    }
    if (used) sheetsUsed.push(sheet.name);
  }

  return { rows: merged, effectiveDate, sheetsUsed };
}
