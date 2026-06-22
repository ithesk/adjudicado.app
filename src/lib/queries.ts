import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  bitacoraDemo,
  documentosDe,
  demoInstitucionPorNombre,
  demoInstituciones,
  demoOrden,
  demoOrdenes,
  demoPersona,
  demoPersonas,
  demoSuplidorPorNombre,
  demoSuplidores,
  isDemo,
  itemsDemo,
} from "@/lib/demo";
import { getMiembro } from "@/lib/auth";
import {
  diasRestantes,
  esViva,
  estaAtascado,
  nivelUrgencia,
  plazoDominante,
  porCobrar,
  type Bitacora,
  type Documento,
  type Institucion,
  type Item,
  type Orden,
  type Persona,
  type Suplidor,
  type TipoItem,
} from "@/lib/types";

export interface ItemResumen {
  entregado: boolean;
  suplidor?: string | null;
  nombre?: string;
  tipo?: TipoItem;
  estado_item?: string | null;
  fecha_estim?: string | null;
}

export type OrdenConItems = Orden & {
  item: ItemResumen[];
  responsable?: Persona | null;
};

// ---------- Repositorio global de documentos ----------

export interface DocumentoGlobal {
  id: string;
  orden_id: string;
  nombre: string;
  tipo: string;
  archivo_url: string;
  created_at: string;
  numeroOc: string | null;
  institucion: string | null;
}

// Todos los documentos de todas las órdenes, con su contexto. Para encontrarlos
// rápido sin importar en qué licitación se esté trabajando.
export async function listarDocumentos(): Promise<DocumentoGlobal[]> {
  if (isDemo()) {
    return demoOrdenes()
      .flatMap((o) =>
        documentosDe(o).map((d) => ({
          id: d.id,
          orden_id: d.orden_id,
          nombre: d.nombre,
          tipo: d.tipo,
          archivo_url: d.archivo_url,
          created_at: d.created_at,
          numeroOc: o.numero_oc,
          institucion: o.institucion,
        })),
      )
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("documento")
    .select("*, orden(numero_oc, institucion)")
    .order("created_at", { ascending: false });
  return ((data as unknown[] | null) ?? []).map((row) => {
    const d = row as Record<string, unknown> & {
      orden?: { numero_oc?: string; institucion?: string };
    };
    return {
      id: d.id as string,
      orden_id: d.orden_id as string,
      nombre: d.nombre as string,
      tipo: (d.tipo as string) ?? "otro",
      archivo_url: d.archivo_url as string,
      created_at: d.created_at as string,
      numeroOc: d.orden?.numero_oc ?? null,
      institucion: d.orden?.institucion ?? null,
    };
  });
}

// ---------- Catálogo reutilizable ----------

export async function listarSuplidores(): Promise<Suplidor[]> {
  if (isDemo()) return demoSuplidores();
  const miembro = await getMiembro();
  if (!miembro) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("suplidor")
    .select("id, nombre, canal, notas, contacto(id, nombre, rol, email, telefono)")
    .eq("org_id", miembro.org_id)
    .order("nombre");
  return ((data as unknown as Suplidor[] | null) ?? []).map((s) => ({
    ...s,
    contactos: (s as unknown as { contacto?: Suplidor["contactos"] }).contacto ?? [],
  }));
}

export async function suplidorPorNombre(
  nombre: string | null,
): Promise<Suplidor | null> {
  if (isDemo()) return demoSuplidorPorNombre(nombre);
  if (!nombre) return null;
  const lista = await listarSuplidores();
  return (
    lista.find((s) => s.nombre.toLowerCase() === nombre.toLowerCase()) ?? null
  );
}

export async function listarInstituciones(): Promise<Institucion[]> {
  if (isDemo()) return demoInstituciones();
  const miembro = await getMiembro();
  if (!miembro) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("institucion")
    .select("id, nombre, siglas, contacto(id, nombre, rol, email, telefono)")
    .eq("org_id", miembro.org_id)
    .order("nombre");
  return ((data as unknown as Institucion[] | null) ?? []).map((i) => ({
    ...i,
    contactos:
      (i as unknown as { contacto?: Institucion["contactos"] }).contacto ?? [],
  }));
}

export async function institucionPorNombre(
  nombre: string | null,
): Promise<Institucion | null> {
  if (isDemo()) return demoInstitucionPorNombre(nombre);
  if (!nombre) return null;
  const lista = await listarInstituciones();
  return (
    lista.find((i) => i.nombre.toLowerCase() === nombre.toLowerCase()) ?? null
  );
}

// Invitaciones pendientes de la empresa activa (invitados que aún no aceptan).
export interface Pendiente {
  id: string;
  email: string;
  invited_at: string | null;
}

export async function listarPendientes(): Promise<Pendiente[]> {
  if (isDemo()) return [];
  const miembro = await getMiembro();
  if (!miembro) return [];
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return (data?.users ?? [])
    .filter(
      (u) =>
        !u.email_confirmed_at &&
        (u.user_metadata as { invite_org_id?: string })?.invite_org_id ===
          miembro.org_id,
    )
    .map((u) => ({
      id: u.id,
      email: u.email ?? "",
      invited_at: u.invited_at ?? null,
    }));
}

// Personas asignables como responsable (miembros de la org).
export async function listarPersonas(): Promise<Persona[]> {
  if (isDemo()) return demoPersonas();
  const supabase = await createClient();
  const miembro = await getMiembro();
  if (!miembro) return [];
  const { data } = await supabase
    .from("miembro")
    .select("user_id, nombre")
    .eq("org_id", miembro.org_id);
  return (data ?? []).map((m) => ({
    id: m.user_id as string,
    nombre: (m.nombre as string) ?? "—",
  }));
}

// Lista de órdenes de la org (RLS ya filtra), ordenada por urgencia de plazo.
export async function listarOrdenes(): Promise<OrdenConItems[]> {
  if (isDemo()) {
    return ordenarPorUrgencia(
      demoOrdenes().map((o) => ({
        ...o,
        item: o.item.map((i) => ({
          entregado: i.entregado,
          suplidor: i.suplidor,
          nombre: i.nombre,
          tipo: i.tipo,
          estado_item: i.estado_item,
          fecha_estim: i.fecha_estim,
        })),
        responsable: demoPersona(o.responsable_id),
      })) as OrdenConItems[],
    );
  }
  const miembro = await getMiembro();
  if (!miembro) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orden")
    .select("*, item(entregado, suplidor, nombre, tipo, estado_item, fecha_estim)")
    .eq("org_id", miembro.org_id)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return ordenarPorUrgencia(data as OrdenConItems[]);
}

// Orden por urgencia: vencidas/menos días primero; sin plazo al final.
function ordenarPorUrgencia(ordenes: OrdenConItems[]): OrdenConItems[] {
  return ordenes.sort((a, b) => {
    const da = diasRestantes(plazoDominante(a));
    const db = diasRestantes(plazoDominante(b));
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });
}

export interface Metricas {
  vivas: number;
  vencenPronto: number; // ≤ 5 días
  atascado: number; // RD$ entregado sin facturar
  porCobrar: number; // RD$ facturado
}

export function calcularMetricas(ordenes: Orden[]): Metricas {
  let vivas = 0;
  let vencenPronto = 0;
  let atascado = 0;
  let cobrar = 0;

  for (const o of ordenes) {
    if (esViva(o.estado)) {
      vivas++;
      const dias = diasRestantes(plazoDominante(o));
      const nivel = nivelUrgencia(dias);
      if (nivel === "vencido" || nivel === "rojo" || nivel === "ambar") {
        vencenPronto++;
      }
    }
    if (estaAtascado(o.estado)) atascado += o.monto ?? 0;
    if (porCobrar(o.estado)) cobrar += o.monto ?? 0;
  }

  return { vivas, vencenPronto, atascado, porCobrar: cobrar };
}

export type OrdenDetalle = Orden & {
  item: Item[];
  bitacora: Bitacora[];
  documento: Documento[];
  responsable?: Persona | null;
};

// Una orden con todas sus relaciones.
export async function obtenerOrden(id: string): Promise<OrdenDetalle | null> {
  if (isDemo()) {
    const o = demoOrden(id);
    return o
      ? {
          ...o,
          responsable: demoPersona(o.responsable_id),
          bitacora: bitacoraDemo(o),
          item: itemsDemo(o),
          documento: documentosDe(o),
        }
      : null;
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orden")
    .select("*, item(*), bitacora(*), documento(*)")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const orden = data as OrdenDetalle;
  orden.item.sort((a, b) => a.orden_indice - b.orden_indice);
  orden.bitacora.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  orden.documento.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return orden;
}
