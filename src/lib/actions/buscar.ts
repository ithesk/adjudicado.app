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

  // Quita caracteres que rompen la sintaxis de filtros de PostgREST.
  const limpio = query.replace(/[%,()]/g, " ").trim();
  const like = `%${limpio}%`;
  const incluye = (v: string | null | undefined) =>
    (v ?? "").toLowerCase().includes(limpio.toLowerCase());

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
  const org = miembro.org_id;

  const [ord, its, docs, sup, ins, bit] = await Promise.all([
    supabase
      .from("orden")
      .select("id, numero_oc, institucion, codigo_expediente")
      .eq("org_id", org)
      .or(`numero_oc.ilike.${like},institucion.ilike.${like},codigo_expediente.ilike.${like}`)
      .limit(6),
    supabase
      .from("item")
      .select("id, orden_id, nombre, suplidor, orden!inner(numero_oc, org_id)")
      .eq("orden.org_id", org)
      .or(`nombre.ilike.${like},suplidor.ilike.${like}`)
      .limit(6),
    supabase
      .from("documento")
      .select("id, orden_id, nombre, orden!inner(numero_oc, org_id)")
      .eq("orden.org_id", org)
      .ilike("nombre", like)
      .limit(6),
    supabase
      .from("suplidor")
      .select("id, nombre, canal")
      .eq("org_id", org)
      .ilike("nombre", like)
      .limit(6),
    supabase
      .from("institucion")
      .select("id, nombre, siglas")
      .eq("org_id", org)
      .ilike("nombre", like)
      .limit(6),
    supabase
      .from("bitacora")
      .select("id, orden_id, texto, tipo, orden!inner(numero_oc, org_id)")
      .eq("orden.org_id", org)
      .ilike("texto", like)
      .limit(6),
  ]);

  type Row = Record<string, unknown> & { orden?: { numero_oc?: string | null } };
  const oc = (r: Row) => r.orden?.numero_oc ?? "OC s/n";

  return {
    ordenes: ((ord.data as Row[] | null) ?? []).map((o) => ({
      id: o.id as string,
      titulo: (o.numero_oc as string) || "OC s/n",
      sub: (o.institucion as string) || (o.codigo_expediente as string) || "",
      href: `/orden/${o.id}`,
    })),
    items: ((its.data as Row[] | null) ?? []).map((i) => ({
      id: i.id as string,
      titulo: i.nombre as string,
      sub: `${(i.suplidor as string) || "sin suplidor"} · ${oc(i)}`,
      href: `/orden/${i.orden_id}`,
    })),
    documentos: ((docs.data as Row[] | null) ?? []).map((d) => ({
      id: d.id as string,
      titulo: d.nombre as string,
      sub: `Documento · ${oc(d)}`,
      href: `/orden/${d.orden_id}`,
    })),
    suplidores: ((sup.data as Row[] | null) ?? []).map((s) => ({
      id: s.id as string,
      titulo: s.nombre as string,
      sub: (s.canal as string) || "Suplidor",
      href: "/configuracion",
    })),
    instituciones: ((ins.data as Row[] | null) ?? []).map((i) => ({
      id: i.id as string,
      titulo: i.nombre as string,
      sub: (i.siglas as string) || "Institución",
      href: "/configuracion",
    })),
    bitacora: ((bit.data as Row[] | null) ?? []).map((b) => ({
      id: b.id as string,
      titulo: (b.texto as string).slice(0, 80),
      sub: `${b.tipo as string} · ${oc(b)}`,
      href: `/orden/${b.orden_id}`,
    })),
  };
}
