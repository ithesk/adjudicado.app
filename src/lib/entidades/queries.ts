// Capa de datos de la GESTIÓN DE ENTIDADES: la ficha completa de cada
// entidad del Estado — perfil, asignación (personas/grupos), contactos,
// lo relacionado (órdenes y procesos) y su bitácora de movimientos.
// Lecturas con orgActivaLigera (la RLS es la frontera real de seguridad).

import { createClient } from "@/lib/supabase/server";
import { orgActivaLigera } from "@/lib/auth";
import { isDemo } from "@/lib/demo";

export interface ContactoEntidad {
  id: string;
  nombre: string;
  rol: string | null;
  email: string | null;
  telefono: string | null; // el directo
  extension: string | null;
  notas: string | null;
}

export interface AsignacionEntidad {
  id: string;
  user_id: string | null;
  grupo_id: string | null;
  nombre: string; // legible: persona o grupo
}

export interface EventoEntidad {
  id: string;
  tipo: string; // perfil | logo | contacto | asignacion | nota | orden
  texto: string;
  autor: string | null;
  created_at: string;
  // Si el movimiento viene de la bitácora de una orden de esta entidad:
  orden_id?: string;
  numero_oc?: string | null;
}

export interface EntidadResumen {
  id: string;
  nombre: string;
  siglas: string | null;
  rnc: string | null;
  telefono: string | null;
  logo: string | null; // URL firmada, lista para <img>
  ordenes: number;
  procesos: number;
  asignados: string[]; // nombres legibles
}

export interface EntidadDetalle {
  id: string;
  nombre: string;
  siglas: string | null;
  rnc: string | null;
  direccion: string | null;
  telefono: string | null;
  notas: string | null;
  logo: string | null; // URL firmada
  contactos: ContactoEntidad[];
  asignaciones: AsignacionEntidad[];
  eventos: EventoEntidad[];
  ordenes: { id: string; numero_oc: string | null; estado: string; monto: number | null; fecha_oc: string | null }[];
  procesos: { id: string; codigo: string; estado: string; cierre: string | null }[];
  // Formularios que esta entidad exige en SU versión (variantes de plantilla).
  plantillas: { id: string; codigo: string; nombre: string; estado: string }[];
}

function nombreLegible(nombre: string | null): string {
  if (!nombre) return "—";
  const limpio = nombre.includes("@") ? nombre.split("@")[0] : nombre;
  return limpio
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function urlFirmada(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage
    .from("documentos")
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

// Para selectores (ej. "crear variante de plantilla para…").
export async function listarEntidadesLigero(): Promise<
  { id: string; nombre: string; siglas: string | null }[]
> {
  if (isDemo()) return [];
  const orgId = await orgActivaLigera();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("institucion")
    .select("id, nombre, siglas")
    .eq("org_id", orgId)
    .order("nombre");
  return data ?? [];
}

export async function listarEntidadesResumen(): Promise<EntidadResumen[]> {
  if (isDemo()) return [];
  const orgId = await orgActivaLigera();
  if (!orgId) return [];
  const supabase = await createClient();

  const [{ data: entidades }, { data: ordenes }, { data: procesos }, { data: asignaciones }, { data: miembros }, { data: grupos }] =
    await Promise.all([
      supabase
        .from("institucion")
        .select("id, nombre, siglas, rnc, telefono, logo_url")
        .eq("org_id", orgId)
        .order("nombre"),
      supabase.from("orden").select("institucion_id").eq("org_id", orgId),
      supabase.from("lic_proceso").select("institucion_id").eq("org_id", orgId),
      supabase
        .from("institucion_asignacion")
        .select("institucion_id, user_id, grupo_id")
        .eq("org_id", orgId),
      supabase.from("miembro").select("user_id, nombre").eq("org_id", orgId),
      supabase.from("grupo").select("id, nombre").eq("org_id", orgId),
    ]);

  const porPersona = new Map((miembros ?? []).map((m) => [m.user_id, nombreLegible(m.nombre)]));
  const porGrupo = new Map((grupos ?? []).map((g) => [g.id, g.nombre as string]));
  const nOrdenes = new Map<string, number>();
  for (const o of ordenes ?? []) {
    if (o.institucion_id) nOrdenes.set(o.institucion_id, (nOrdenes.get(o.institucion_id) ?? 0) + 1);
  }
  const nProcesos = new Map<string, number>();
  for (const p of procesos ?? []) {
    if (p.institucion_id) nProcesos.set(p.institucion_id, (nProcesos.get(p.institucion_id) ?? 0) + 1);
  }
  const asigPorEntidad = new Map<string, string[]>();
  for (const a of asignaciones ?? []) {
    const nombre = a.user_id ? porPersona.get(a.user_id) : a.grupo_id ? porGrupo.get(a.grupo_id) : null;
    if (!nombre) continue;
    asigPorEntidad.set(a.institucion_id, [...(asigPorEntidad.get(a.institucion_id) ?? []), nombre]);
  }

  return Promise.all(
    (entidades ?? []).map(async (e) => ({
      id: e.id,
      nombre: e.nombre,
      siglas: e.siglas,
      rnc: e.rnc,
      telefono: e.telefono,
      logo: await urlFirmada(supabase, e.logo_url),
      ordenes: nOrdenes.get(e.id) ?? 0,
      procesos: nProcesos.get(e.id) ?? 0,
      asignados: asigPorEntidad.get(e.id) ?? [],
    })),
  );
}

export async function obtenerEntidadDetalle(id: string): Promise<EntidadDetalle | null> {
  if (isDemo()) return null;
  const orgId = await orgActivaLigera();
  if (!orgId) return null;
  const supabase = await createClient();

  const { data: e } = await supabase
    .from("institucion")
    .select("id, nombre, siglas, rnc, direccion, telefono, notas, logo_url")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!e) return null;

  const [
    { data: contactos },
    { data: asignaciones },
    { data: eventos },
    { data: ordenes },
    { data: procesos },
    { data: miembros },
    { data: grupos },
    { data: plantillas },
  ] = await Promise.all([
    supabase
      .from("contacto")
      .select("id, nombre, rol, email, telefono, extension, notas")
      .eq("institucion_id", id)
      .order("nombre"),
    supabase
      .from("institucion_asignacion")
      .select("id, user_id, grupo_id")
      .eq("institucion_id", id),
    supabase
      .from("institucion_evento")
      .select("id, tipo, texto, autor_id, created_at")
      .eq("institucion_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("orden")
      .select("id, numero_oc, estado, monto, fecha_oc")
      .eq("institucion_id", id)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("lic_proceso")
      .select("id, codigo, estado, cierre")
      .eq("institucion_id", id)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("miembro").select("user_id, nombre").eq("org_id", orgId),
    supabase.from("grupo").select("id, nombre").eq("org_id", orgId),
    supabase
      .from("lic_plantilla")
      .select("id, codigo, nombre, estado")
      .eq("institucion_id", id)
      .eq("org_id", orgId)
      .order("codigo"),
  ]);

  const porPersona = new Map((miembros ?? []).map((m) => [m.user_id, nombreLegible(m.nombre)]));
  const porGrupo = new Map((grupos ?? []).map((g) => [g.id, g.nombre as string]));

  // "Todos los movimientos": los eventos propios de la entidad + la bitácora
  // de sus órdenes, en un solo hilo cronológico.
  const idsOrdenes = (ordenes ?? []).map((o) => o.id);
  let deOrdenes: EventoEntidad[] = [];
  if (idsOrdenes.length > 0) {
    const { data: bitOrdenes } = await supabase
      .from("bitacora")
      .select("id, tipo, texto, autor_id, created_at, orden_id")
      .in("orden_id", idsOrdenes)
      .order("created_at", { ascending: false })
      .limit(30);
    const ocPorOrden = new Map((ordenes ?? []).map((o) => [o.id, o.numero_oc]));
    deOrdenes = (bitOrdenes ?? []).map((b) => ({
      id: b.id,
      tipo: "orden",
      texto: b.texto,
      autor: porPersona.get(b.autor_id) ?? null,
      created_at: b.created_at,
      orden_id: b.orden_id,
      numero_oc: ocPorOrden.get(b.orden_id) ?? null,
    }));
  }
  const propios: EventoEntidad[] = (eventos ?? []).map((ev) => ({
    id: ev.id,
    tipo: ev.tipo,
    texto: ev.texto,
    autor: porPersona.get(ev.autor_id) ?? null,
    created_at: ev.created_at,
  }));
  const feed = [...propios, ...deOrdenes]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 60);

  return {
    id: e.id,
    nombre: e.nombre,
    siglas: e.siglas,
    rnc: e.rnc,
    direccion: e.direccion,
    telefono: e.telefono,
    notas: e.notas,
    logo: await urlFirmada(supabase, e.logo_url),
    contactos: (contactos ?? []) as ContactoEntidad[],
    asignaciones: (asignaciones ?? []).map((a) => ({
      id: a.id,
      user_id: a.user_id,
      grupo_id: a.grupo_id,
      nombre: a.user_id
        ? porPersona.get(a.user_id) ?? "—"
        : porGrupo.get(a.grupo_id) ?? "—",
    })),
    eventos: feed,
    ordenes: ordenes ?? [],
    procesos: procesos ?? [],
    plantillas: plantillas ?? [],
  };
}
