"use server";

import { createClient } from "@/lib/supabase/server";
import { getMiembro } from "@/lib/auth";
import {
  demoInstituciones,
  demoOrdenes,
  demoSuplidores,
  isDemo,
} from "@/lib/demo";

export interface Hit {
  id: string;
  titulo: string;
  sub: string;
  href: string;
}

export interface ResultadoBusqueda {
  ordenes: Hit[];
  items: Hit[];
  documentos: Hit[];
  suplidores: Hit[];
  instituciones: Hit[];
  bitacora: Hit[];
}

const vacio: ResultadoBusqueda = {
  ordenes: [],
  items: [],
  documentos: [],
  suplidores: [],
  instituciones: [],
  bitacora: [],
};

export async function buscarGlobal(q: string): Promise<ResultadoBusqueda> {
  const query = q.trim();
  if (query.length < 2) return vacio;

  const limpio = query.replace(/[%,()]/g, " ").trim();
  // Normaliza para comparar sin acentos ni mayúsculas.
  const fold = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const objetivo = fold(limpio);
  const incluye = (v: string | null | undefined) => fold(v ?? "").includes(objetivo);

  if (isDemo()) {
    const out: ResultadoBusqueda = {
      ordenes: [],
      items: [],
      documentos: [],
      suplidores: [],
      instituciones: [],
      bitacora: [],
    };
    for (const o of demoOrdenes()) {
      if (incluye(o.numero_oc) || incluye(o.institucion) || incluye(o.codigo_expediente)) {
        out.ordenes.push({
          id: o.id,
          titulo: o.numero_oc ?? "OC s/n",
          sub: o.institucion ?? "",
          href: `/orden/${o.id}`,
        });
      }
      for (const it of o.item) {
        if (incluye(it.nombre) || incluye(it.suplidor)) {
          out.items.push({
            id: `${o.id}-${it.nombre}`,
            titulo: it.nombre,
            sub: `${it.suplidor ?? "sin suplidor"} · ${o.numero_oc ?? ""}`,
            href: `/orden/${o.id}`,
          });
        }
      }
    }
    for (const s of demoSuplidores())
      if (incluye(s.nombre))
        out.suplidores.push({ id: s.id, titulo: s.nombre, sub: s.canal ?? "", href: "/configuracion" });
    for (const i of demoInstituciones())
      if (incluye(i.nombre))
        out.instituciones.push({ id: i.id, titulo: i.nombre, sub: i.siglas ?? "", href: "/configuracion" });
    return out;
  }

  const miembro = await getMiembro();
  if (!miembro) return vacio;
  const supabase = await createClient();

  // RPC con unaccent: insensible a mayúsculas y acentos, filtrada por org.
  const { data, error } = await supabase.rpc("buscar_global", {
    p_org: miembro.org_id,
    p_q: limpio,
  });
  if (error || !data) return vacio;

  type Fila = {
    tipo: keyof ResultadoBusqueda;
    id: string;
    orden_id: string | null;
    titulo: string;
    sub: string;
  };
  const out: ResultadoBusqueda = {
    ordenes: [],
    items: [],
    documentos: [],
    suplidores: [],
    instituciones: [],
    bitacora: [],
  };
  const grupoDe: Record<string, keyof ResultadoBusqueda> = {
    orden: "ordenes",
    item: "items",
    documento: "documentos",
    suplidor: "suplidores",
    institucion: "instituciones",
    bitacora: "bitacora",
  };
  for (const f of data as Fila[]) {
    const grupo = grupoDe[f.tipo as string];
    if (!grupo) continue;
    const href = f.orden_id ? `/orden/${f.orden_id}` : "/configuracion";
    out[grupo].push({ id: `${f.tipo}-${f.id}`, titulo: f.titulo, sub: f.sub, href });
  }
  return out;
}
