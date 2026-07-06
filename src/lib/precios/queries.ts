// Capa de datos de la herramienta Precios. Lecturas vía funciones RPC
// (security definer con guard es_miembro, ver supabase_precios.sql);
// mutaciones directas sobre las tablas (RLS por organización).

import { createClient } from "@/lib/supabase/server";
import { getMiembro } from "@/lib/auth";
import { isDemo } from "@/lib/demo";
import type {
  ComentarioPrecio,
  DetallePrecio,
  FacetasPrecios,
  FiltrosPrecios,
  ProductoPrecio,
  ResumenPrecios,
} from "./tipos";

// ===== Modo demo =====

const DEMO_SUPLIDOR = { id: "sup-ingram", nombre: "Ingram Micro" };

function demoProductos(): ProductoPrecio[] {
  const base = {
    descripcion2: null,
    categoria: "Firewall",
    suplidor_id: DEMO_SUPLIDOR.id,
    suplidor_nombre: DEMO_SUPLIDOR.nombre,
    lista_id: "lista-demo",
    vigencia: "2026-06-01",
    marca_color: null,
    comentarios: 0,
  };
  return [
    { ...base, id: 1, sku: "FG-100F", descripcion: "FortiGate 100F Firewall", familia: "FortiGate", precio: 2995, term_meses: null },
    { ...base, id: 2, sku: "FC-10-F100F-950-02-12", descripcion: "FortiGate 100F UTP Bundle 1 año", familia: "FortiGate", precio: 1450, term_meses: 12 },
    { ...base, id: 3, sku: "FC-10-F100F-950-02-36", descripcion: "FortiGate 100F UTP Bundle 3 años", familia: "FortiGate", precio: 3900, term_meses: 36, marca_color: "green" },
    { ...base, id: 4, sku: "FC-10-F100F-950-02-60", descripcion: "FortiGate 100F UTP Bundle 5 años", familia: "FortiGate", precio: 5990, term_meses: 60 },
    { ...base, id: 5, sku: "FS-124F", descripcion: "FortiSwitch 124F 24 puertos", familia: "FortiSwitch", categoria: "Switch", precio: 745, term_meses: null },
    { ...base, id: 6, sku: "FAP-231G", descripcion: "FortiAP 231G Access Point", familia: "FortiAP", categoria: "Wireless", precio: 495, term_meses: null },
  ];
}

function demoBuscar(q: string, filtros: FiltrosPrecios) {
  const fold = (s: string | null | undefined) => (s ?? "").toLowerCase();
  const tokens = fold(q).split(/\s+/).filter(Boolean);
  let productos = demoProductos().filter((p) =>
    tokens.every(
      (t) =>
        fold(p.sku).includes(t) ||
        fold(p.descripcion).includes(t) ||
        fold(p.familia).includes(t),
    ),
  );
  if (filtros.suplidor) productos = productos.filter((p) => p.suplidor_id === filtros.suplidor);
  if (filtros.familia) productos = productos.filter((p) => p.familia === filtros.familia);
  if (filtros.term)
    productos = productos.filter((p) =>
      filtros.term === "none" ? p.term_meses === null : p.term_meses === Number(filtros.term),
    );
  const precios = productos.map((p) => p.precio).filter((v): v is number => v !== null);
  const cuenta = (map: Map<string, number>, k: string) => map.set(k, (map.get(k) ?? 0) + 1);
  const familias = new Map<string, number>();
  const terms = new Map<string, number>();
  for (const p of productos) {
    if (p.familia) cuenta(familias, p.familia);
    cuenta(terms, p.term_meses === null ? "none" : String(p.term_meses));
  }
  const facetas: FacetasPrecios = {
    total: productos.length,
    min_precio: precios.length ? Math.min(...precios) : null,
    max_precio: precios.length ? Math.max(...precios) : null,
    familias: [...familias].map(([value, count]) => ({ value, count })),
    suplidores: productos.length
      ? [{ id: DEMO_SUPLIDOR.id, nombre: DEMO_SUPLIDOR.nombre, count: productos.length }]
      : [],
    terms: [...terms].map(([value, count]) => ({ value, count })),
  };
  return { productos, facetas };
}

// ===== Lecturas =====

export async function buscarPrecios(
  q: string,
  filtros: FiltrosPrecios = {},
): Promise<{ productos: ProductoPrecio[]; facetas: FacetasPrecios | null }> {
  if (q.trim().length < 2) return { productos: [], facetas: null };
  if (isDemo()) return demoBuscar(q, filtros);
  const miembro = await getMiembro();
  if (!miembro) return { productos: [], facetas: null };
  const supabase = await createClient();
  const params = {
    p_org: miembro.org_id,
    p_q: q,
    p_suplidor: filtros.suplidor ?? null,
    p_familia: filtros.familia ?? null,
    p_term: filtros.term ?? null,
  };
  const [res, fac] = await Promise.all([
    supabase.rpc("precios_buscar", {
      ...params,
      p_orden: filtros.orden ?? "relevance",
      p_limite: 100,
    }),
    supabase.rpc("precios_facetas", params),
  ]);
  return {
    productos: (res.data as ProductoPrecio[] | null) ?? [],
    facetas: (fac.data as FacetasPrecios | null) ?? null,
  };
}

export async function detallePrecio(
  suplidorId: string,
  sku: string,
): Promise<DetallePrecio | null> {
  if (isDemo()) {
    const productos = demoProductos();
    const baseSku = sku.replace(/-(12|24|36|48|60)$/, "");
    return {
      base_sku: baseSku,
      variantes: productos.filter((p) => p.sku === sku || p.sku.startsWith(baseSku + "-")),
      historial: [],
      marca: productos.find((p) => p.sku === sku)?.marca_color ?? null,
      comentarios: [],
    };
  }
  const miembro = await getMiembro();
  if (!miembro) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("precios_detalle", {
    p_org: miembro.org_id,
    p_suplidor: suplidorId,
    p_sku: sku,
  });
  return (data as DetallePrecio | null) ?? null;
}

export async function resumenPrecios(): Promise<ResumenPrecios> {
  const vacio: ResumenPrecios = { productos: 0, suplidores: 0, listas: [] };
  if (isDemo()) {
    return {
      productos: demoProductos().length,
      suplidores: 1,
      listas: [
        {
          suplidor_id: DEMO_SUPLIDOR.id,
          suplidor: DEMO_SUPLIDOR.nombre,
          filename: "lista-demo.xlsx",
          vigencia: "2026-06-01",
          importada_at: "2026-06-01T00:00:00Z",
          row_count: demoProductos().length,
        },
      ],
    };
  }
  const miembro = await getMiembro();
  if (!miembro) return vacio;
  const supabase = await createClient();
  const { data } = await supabase.rpc("precios_resumen", { p_org: miembro.org_id });
  return (data as ResumenPrecios | null) ?? vacio;
}

// ===== Mutaciones (anotaciones del equipo) =====

export async function marcarPrecio(
  suplidorId: string,
  sku: string,
  color: string | null,
): Promise<void> {
  if (isDemo()) return;
  const miembro = await getMiembro();
  if (!miembro) return;
  const supabase = await createClient();
  if (!color) {
    await supabase
      .from("producto_marca")
      .delete()
      .eq("org_id", miembro.org_id)
      .eq("suplidor_id", suplidorId)
      .eq("sku", sku);
    return;
  }
  await supabase.from("producto_marca").upsert(
    {
      org_id: miembro.org_id,
      suplidor_id: suplidorId,
      sku,
      color,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,suplidor_id,sku" },
  );
}

export async function comentarPrecio(
  suplidorId: string,
  sku: string,
  texto: string,
): Promise<ComentarioPrecio | null> {
  const cuerpo = texto.trim();
  if (!cuerpo) return null;
  if (isDemo()) return null;
  const miembro = await getMiembro();
  if (!miembro) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("producto_comentario")
    .insert({
      org_id: miembro.org_id,
      suplidor_id: suplidorId,
      sku,
      autor_id: miembro.user_id,
      texto: cuerpo.slice(0, 2000),
    })
    .select("id, autor_id, texto, created_at")
    .single();
  if (!data) return null;
  return { ...data, autor: miembro.nombre } as ComentarioPrecio;
}

export async function eliminarComentarioPrecio(id: string): Promise<void> {
  if (isDemo()) return;
  const miembro = await getMiembro();
  if (!miembro) return;
  const supabase = await createClient();
  await supabase
    .from("producto_comentario")
    .delete()
    .eq("id", id)
    .eq("org_id", miembro.org_id);
}
