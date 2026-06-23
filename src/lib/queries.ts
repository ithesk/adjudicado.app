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
  nombreLegible,
  plazoDominante,
  porCobrar,
  type Bitacora,
  type Documento,
  type Institucion,
  type Item,
  type Orden,
  type Persona,
  type Suplidor,
  type TipoBitacora,
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
  bucket: "documentos" | "ordenes-oc";
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
          bucket: "documentos" as const,
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
  // El repositorio global = documentos subidos + la OC original de cada orden
  // (que vive en orden.oc_archivo_url, no en la tabla documento).
  const [docsRes, ordenesRes] = await Promise.all([
    supabase
      .from("documento")
      .select("*, orden(numero_oc, institucion)")
      .order("created_at", { ascending: false }),
    supabase
      .from("orden")
      .select("id, numero_oc, institucion, oc_archivo_url, created_at")
      .not("oc_archivo_url", "is", null),
  ]);

  const docs: DocumentoGlobal[] = ((docsRes.data as unknown[] | null) ?? []).map(
    (row) => {
      const d = row as Record<string, unknown> & {
        orden?: { numero_oc?: string; institucion?: string };
      };
      return {
        id: d.id as string,
        orden_id: d.orden_id as string,
        nombre: d.nombre as string,
        tipo: (d.tipo as string) ?? "otro",
        archivo_url: d.archivo_url as string,
        bucket: "documentos",
        created_at: d.created_at as string,
        numeroOc: d.orden?.numero_oc ?? null,
        institucion: d.orden?.institucion ?? null,
      };
    },
  );

  const ocs: DocumentoGlobal[] = (
    (ordenesRes.data as
      | {
          id: string;
          numero_oc: string | null;
          institucion: string | null;
          oc_archivo_url: string;
          created_at: string;
        }[]
      | null) ?? []
  ).map((o) => ({
    id: `oc-${o.id}`,
    orden_id: o.id,
    nombre: o.numero_oc ? `OC ${o.numero_oc}` : "Orden de compra",
    tipo: "oc",
    archivo_url: o.oc_archivo_url,
    bucket: "ordenes-oc",
    created_at: o.created_at,
    numeroOc: o.numero_oc,
    institucion: o.institucion,
  }));

  return [...ocs, ...docs].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
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
    nombre: nombreLegible(m.nombre as string | null),
  }));
}

// ---------- Bitácora general del sistema ----------
// Toda la actividad de todas las órdenes de la empresa, en un solo feed.
// Es la cúspide de la jerarquía: ítem → orden → sistema. Nada queda suelto.
export interface ActividadGlobal {
  id: string;
  texto: string;
  tipo: TipoBitacora;
  created_at: string;
  autor: Persona | null;
  ordenId: string;
  numeroOc: string | null;
  institucion: string | null;
  itemNombre: string | null;
}

export async function listarActividad(): Promise<ActividadGlobal[]> {
  if (isDemo()) {
    const out: ActividadGlobal[] = [];
    for (const o of demoOrdenes()) {
      for (const b of bitacoraDemo(o)) {
        out.push({
          id: b.id,
          texto: b.texto,
          tipo: b.tipo,
          created_at: b.created_at,
          autor: b.autor ?? null,
          ordenId: o.id,
          numeroOc: o.numero_oc,
          institucion: o.institucion,
          itemNombre: null,
        });
      }
      for (const it of itemsDemo(o)) {
        for (const c of it.coordinacion ?? []) {
          out.push({
            id: c.id,
            texto: c.texto,
            tipo: c.tipo,
            created_at: c.created_at,
            autor: c.autor ?? null,
            ordenId: o.id,
            numeroOc: o.numero_oc,
            institucion: o.institucion,
            itemNombre: it.nombre,
          });
        }
      }
    }
    return out.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }

  const miembro = await getMiembro();
  if (!miembro) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("bitacora")
    .select(
      "id, texto, tipo, created_at, autor_id, orden_id, orden!inner(numero_oc, institucion, org_id), item(nombre)",
    )
    .eq("orden.org_id", miembro.org_id)
    .order("created_at", { ascending: false })
    .limit(300);

  const personas = await listarPersonas();
  const porId = new Map(personas.map((p) => [p.id, p]));

  return ((data as unknown[] | null) ?? []).map((row) => {
    const r = row as {
      id: string;
      texto: string;
      tipo: TipoBitacora;
      created_at: string;
      autor_id: string | null;
      orden_id: string;
      orden?: { numero_oc?: string | null; institucion?: string | null };
      item?: { nombre?: string | null } | null;
    };
    return {
      id: r.id,
      texto: r.texto,
      tipo: r.tipo,
      created_at: r.created_at,
      autor: r.autor_id ? porId.get(r.autor_id) ?? null : null,
      ordenId: r.orden_id,
      numeroOc: r.orden?.numero_oc ?? null,
      institucion: r.orden?.institucion ?? null,
      itemNombre: r.item?.nombre ?? null,
    };
  });
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

  // Resolver el responsable (el tablero muestra su nombre/avatar).
  const personas = await listarPersonas();
  const porId = new Map(personas.map((p) => [p.id, p]));
  const ordenes = (data as OrdenConItems[]).map((o) => ({
    ...o,
    responsable: o.responsable_id ? porId.get(o.responsable_id) ?? null : null,
  }));
  return ordenarPorUrgencia(ordenes);
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
  colaboradoresPersonas?: Persona[];
};

// Una orden con todas sus relaciones.
export async function obtenerOrden(id: string): Promise<OrdenDetalle | null> {
  if (isDemo()) {
    const o = demoOrden(id);
    return o
      ? {
          ...o,
          responsable: demoPersona(o.responsable_id),
          colaboradoresPersonas: (o.colaboradores ?? [])
            .map((id) => demoPersona(id))
            .filter((p): p is Persona => Boolean(p)),
          bitacora: bitacoraDemo(o),
          item: itemsDemo(o),
          documento: documentosDe(o),
        }
      : null;
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orden")
    .select(
      "*, item(*), bitacora(*, bitacora_reaccion(emoji, user_id), bitacora_comentario(id, autor_id, texto, created_at)), documento(*)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const orden = data as OrdenDetalle;

  // Resolver nombres (responsable + autores de la bitácora) desde los miembros
  // de la org, para no mostrar "Alguien".
  const personas = await listarPersonas();
  const porId = new Map(personas.map((p) => [p.id, p]));
  const nombreDe = (uid: string | null) =>
    (uid ? porId.get(uid)?.nombre : null) ?? "Miembro del equipo";
  const nombreItem = new Map(orden.item.map((i) => [i.id, i.nombre]));
  const docPorId = new Map(orden.documento.map((d) => [d.id, d]));

  orden.responsable = orden.responsable_id
    ? porId.get(orden.responsable_id) ?? null
    : null;
  orden.colaboradoresPersonas = (orden.colaboradores ?? [])
    .map((id) => porId.get(id))
    .filter((p): p is Persona => Boolean(p));

  orden.bitacora = orden.bitacora.map((b) => {
    const raw = b as Bitacora & {
      bitacora_reaccion?: { emoji: string; user_id: string }[];
      bitacora_comentario?: {
        id: string;
        autor_id: string | null;
        texto: string;
        created_at: string;
      }[];
    };

    // Agrupar reacciones por emoji con los nombres de quienes reaccionaron.
    const porEmoji = new Map<string, string[]>();
    for (const r of raw.bitacora_reaccion ?? []) {
      const arr = porEmoji.get(r.emoji) ?? [];
      arr.push(nombreDe(r.user_id));
      porEmoji.set(r.emoji, arr);
    }
    const reacciones = Array.from(porEmoji, ([emoji, usuarios]) => ({
      emoji,
      usuarios,
    }));

    const comentarios = (raw.bitacora_comentario ?? [])
      .map((c) => ({
        id: c.id,
        autor: { id: c.autor_id ?? "", nombre: nombreDe(c.autor_id) },
        texto: c.texto,
        created_at: c.created_at,
      }))
      .sort(
        (x, y) =>
          new Date(x.created_at).getTime() - new Date(y.created_at).getTime(),
      );

    const itemId = b.item_id ?? null;
    const doc = b.documento_id ? docPorId.get(b.documento_id) : null;
    return {
      ...b,
      autor: b.autor_id ? porId.get(b.autor_id) ?? null : null,
      itemNombre: itemId ? nombreItem.get(itemId) ?? null : null,
      adjuntos: doc
        ? [{ nombre: doc.nombre, bucket: "documentos" as const, path: doc.archivo_url }]
        : undefined,
      reacciones: reacciones.length ? reacciones : undefined,
      comentarios: comentarios.length ? comentarios : undefined,
    };
  });

  // Jerarquía: la bitácora de la ORDEN conserva TODAS las entradas (incluidas
  // las de ítem, etiquetadas con su nombre). Además, cada entrada de ítem se
  // engancha al hilo de coordinación de su ítem. Nada queda suelto.
  const coordPorItem = new Map<string, Bitacora[]>();
  for (const b of orden.bitacora) {
    const itemId = b.item_id ?? null;
    if (itemId) {
      const arr = coordPorItem.get(itemId) ?? [];
      arr.push(b);
      coordPorItem.set(itemId, arr);
    }
  }
  orden.item = orden.item.map((it) => ({
    ...it,
    coordinacion: (coordPorItem.get(it.id) ?? []).sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    ),
  }));

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
