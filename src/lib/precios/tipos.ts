// Tipos y helpers de la herramienta Precios (listas de suplidores).
// Sin imports de servidor: se usa desde componentes cliente y servidor.

export interface ProductoPrecio {
  id: number;
  sku: string;
  descripcion: string | null;
  descripcion2: string | null;
  familia: string | null;
  categoria: string | null;
  precio: number | null;
  term_meses: number | null;
  suplidor_id: string;
  suplidor_nombre: string;
  lista_id: string;
  vigencia: string | null;
  marca_color: string | null;
  comentarios: number;
}

export interface FacetasPrecios {
  total: number;
  min_precio: number | null;
  max_precio: number | null;
  familias: { value: string; count: number }[];
  suplidores: { id: string; nombre: string; count: number }[];
  terms: { value: string; count: number }[];
}

export interface ComentarioPrecio {
  id: string;
  autor_id: string | null;
  autor: string | null;
  texto: string;
  created_at: string;
}

export interface HistorialPrecio {
  sku: string;
  precio: number | null;
  vigencia: string | null;
  importada_at: string;
  filename: string | null;
  is_active: boolean;
}

export interface DetallePrecio {
  base_sku: string;
  variantes: ProductoPrecio[];
  historial: HistorialPrecio[];
  marca: string | null;
  comentarios: ComentarioPrecio[];
}

export interface ListaPrecio {
  id: string;
  suplidor_id: string;
  suplidor_nombre: string;
  filename: string | null;
  vigencia: string | null;
  importada_at: string;
  row_count: number;
  is_active: boolean;
}

/** Frescura de una lista respecto a su vigencia (o fecha de importación).
 *  Las listas suelen ser trimestrales: verde ≤ 100 días, ámbar ≤ 200,
 *  rojo más vieja. */
export function edadLista(
  vigencia: string | null,
  importada: string,
): { dias: number; label: string; nivel: "ok" | "warn" | "danger" } {
  const ref = new Date(vigencia ?? importada).getTime();
  const dias = Math.max(0, Math.floor((Date.now() - ref) / 86_400_000));
  const label =
    dias === 0
      ? "hoy"
      : dias < 30
        ? `hace ${dias} día${dias === 1 ? "" : "s"}`
        : dias < 365
          ? `hace ${Math.round(dias / 30)} mes${Math.round(dias / 30) === 1 ? "" : "es"}`
          : `hace ${(dias / 365).toFixed(1)} años`;
  const nivel = dias <= 100 ? "ok" : dias <= 200 ? "warn" : "danger";
  return { dias, label, nivel };
}

export interface ListaVigente {
  suplidor_id: string;
  suplidor: string;
  filename: string | null;
  vigencia: string | null;
  importada_at: string;
  row_count: number;
}

export interface ResumenPrecios {
  productos: number;
  suplidores: number;
  listas: ListaVigente[];
}

export type OrdenPrecios = "relevance" | "price_asc" | "price_desc";

export interface FiltrosPrecios {
  suplidor?: string;
  familia?: string;
  term?: string; // 'none' | '12' | '24' | ...
  orden?: OrdenPrecios;
}

// Las listas de suplidores vienen en USD.
export const fmtUSD = (p: number | null | undefined) =>
  p === null || p === undefined
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        // sin decimales cuando el precio es entero — columnas más compactas
        minimumFractionDigits: p % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(p);

export const fmtTermino = (m: number | null | undefined) => {
  if (m === null || m === undefined) return "";
  if (m % 12 === 0) return `${m / 12} año${m > 12 ? "s" : ""}`;
  return `${m} meses`;
};

export const labelTermino = (v: string) =>
  v === "none" ? "Sin término" : fmtTermino(Number(v));

/** Colores de resaltado estilo Notion — funcionan en tema claro y oscuro
 *  porque usan transparencia sobre el fondo. */
export const MARCA_COLORES: { id: string; label: string; dot: string; bg: string }[] = [
  { id: "yellow", label: "Amarillo", dot: "#F5B93E", bg: "rgba(245, 185, 62, 0.16)" },
  { id: "green", label: "Verde", dot: "#3FA35C", bg: "rgba(63, 163, 92, 0.15)" },
  { id: "blue", label: "Azul", dot: "#2383E2", bg: "rgba(35, 131, 226, 0.14)" },
  { id: "red", label: "Rojo", dot: "#E2543E", bg: "rgba(226, 84, 62, 0.14)" },
  { id: "purple", label: "Morado", dot: "#9A6DD7", bg: "rgba(154, 109, 215, 0.15)" },
];

export const marcaBg = (color: string | null | undefined): string | undefined =>
  MARCA_COLORES.find((c) => c.id === color)?.bg;

export const marcaDot = (color: string | null | undefined): string | undefined =>
  MARCA_COLORES.find((c) => c.id === color)?.dot;
