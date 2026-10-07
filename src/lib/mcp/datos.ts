// Capa de datos del conector MCP. Aquí NO hay sesión de usuario: el token
// resolvió una organización y se usa service_role, así que la RLS no
// protege nada — CADA consulta lleva su .eq("org_id", orgId). Sin excepción.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DgcpProceso } from "@/lib/dgcp/api";
import { modalidadDesdeDgcp, normalizar, siglasDesdeCodigo } from "@/lib/dgcp/relevancia";
import { requisitoEstandar, REQUISITOS_ESTANDAR } from "@/lib/licitaciones/requisitos-estandar";
import { coberturaPorTipo } from "@/lib/licitaciones/cobertura-empresa";
import type { DocumentoEmpresa } from "@/lib/empresa/documentos";
import {
  bajarImagenDeUrl,
  guardarImagenItem,
  listarImagenesItems,
  quitarImagenItem,
} from "@/lib/licitaciones/imagenes-item";

export interface Ctx {
  orgId: string;
  creadoPor: string | null;
  supabase: SupabaseClient;
}

export function contexto(orgId: string, creadoPor: string | null): Ctx {
  return { orgId, creadoPor, supabase: createAdminClient() };
}

// ===== Empresa =====

export async function capacidades(ctx: Ctx) {
  const { data } = await ctx.supabase
    .from("lic_capability")
    .select("vendor, estado, nota")
    .eq("org_id", ctx.orgId);
  const filas = data ?? [];
  return {
    socios: filas.filter((f) => f.estado === "partner" || f.estado === "canal").map((f) => f.vendor),
    bloqueados: filas.filter((f) => f.estado === "blocker").map((f) => f.vendor),
    filas,
  };
}

export async function perfilEmpresa(ctx: Ctx) {
  const [perfil, firmantes, docs, caps] = await Promise.all([
    ctx.supabase
      .from("empresa_perfil")
      .select("nombre_legal, rnc, rpe, tasa_usd_dop, tasa_fecha, margen_pct, margen_modo, itbis_pct")
      .eq("org_id", ctx.orgId)
      .maybeSingle(),
    ctx.supabase.from("lic_firmante").select("rol, nombre, cargo").eq("org_id", ctx.orgId),
    ctx.supabase.from("documento_empresa").select("*").eq("org_id", ctx.orgId),
    capacidades(ctx),
  ]);
  const cobertura = coberturaPorTipo((docs.data ?? []) as DocumentoEmpresa[]);
  return {
    empresa: perfil.data,
    firmantes: firmantes.data ?? [],
    capacidades: caps.filas,
    documentos_vigentes: Object.values(cobertura).map((c) => ({
      tipo: c.tipo,
      nombre: c.nombre,
      dias_para_vencer: c.dias,
      vencido: c.vencido,
    })),
  };
}

// ===== Procesos ya en la app =====

export async function procesosPorCodigo(ctx: Ctx, codigos: string[]) {
  if (codigos.length === 0) return new Map<string, { id: string; estado: string }>();
  const { data } = await ctx.supabase
    .from("lic_proceso")
    .select("id, codigo, estado")
    .eq("org_id", ctx.orgId)
    .in("codigo", codigos);
  return new Map((data ?? []).map((p) => [p.codigo as string, { id: p.id as string, estado: p.estado as string }]));
}

export async function listarProcesos(ctx: Ctx, estados?: string[]) {
  let q = ctx.supabase
    .from("lic_proceso")
    .select("id, codigo, objeto, modalidad, estado, cierre, institucion(nombre, siglas)")
    .eq("org_id", ctx.orgId)
    .order("cierre", { ascending: true, nullsFirst: false })
    .limit(100);
  if (estados?.length) q = q.in("estado", estados);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ===== Instituciones =====

// Busca la entidad por siglas (las del código del proceso) y, si no, por
// nombre exacto sin tildes. Con `crear`, la da de alta.
export async function resolverInstitucion(
  ctx: Ctx,
  ref: { siglas?: string | null; nombre?: string | null },
  crear: boolean,
): Promise<{ id: string; nombre: string; siglas: string | null } | null> {
  const { data } = await ctx.supabase
    .from("institucion")
    .select("id, nombre, siglas")
    .eq("org_id", ctx.orgId);
  const todas = data ?? [];
  const siglas = ref.siglas?.trim().toUpperCase();
  const nombre = ref.nombre ? normalizar(ref.nombre.trim()) : null;
  const hallada =
    (siglas && todas.find((i) => i.siglas?.trim().toUpperCase() === siglas)) ||
    (nombre && todas.find((i) => normalizar(i.nombre.trim()) === nombre)) ||
    (siglas && todas.find((i) => normalizar(i.nombre).toUpperCase() === siglas));
  if (hallada) return hallada;
  if (!crear || !ref.nombre) return null;
  const { data: nueva, error } = await ctx.supabase
    .from("institucion")
    .insert({ org_id: ctx.orgId, nombre: ref.nombre.trim(), siglas: siglas ?? null })
    .select("id, nombre, siglas")
    .single();
  if (error) throw new Error(`No se pudo crear la institución: ${error.message}`);
  return nueva;
}

// ===== Memoria institucional =====

export async function patronesDe(ctx: Ctx, institucionId: string) {
  const { data } = await ctx.supabase
    .from("lic_entidad_patron")
    .select("clave, valor, nota, confianza, created_at")
    .eq("org_id", ctx.orgId)
    .eq("institucion_id", institucionId)
    .order("confianza", { ascending: false });
  return data ?? [];
}

// Mismo patrón otra vez = sube la confianza y se queda la nota más nueva
// (el usuario la está matizando).
export async function guardarPatron(
  ctx: Ctx,
  institucionId: string,
  p: { clave: string; nota: string; valor?: Record<string, unknown> },
) {
  const clave = p.clave.trim().toLowerCase().replace(/\s+/g, "_");
  const { data: previo } = await ctx.supabase
    .from("lic_entidad_patron")
    .select("id, confianza")
    .eq("org_id", ctx.orgId)
    .eq("institucion_id", institucionId)
    .eq("clave", clave)
    .maybeSingle();
  if (previo) {
    const { error } = await ctx.supabase
      .from("lic_entidad_patron")
      .update({ nota: p.nota, valor: p.valor ?? {}, confianza: previo.confianza + 1 })
      .eq("id", previo.id)
      .eq("org_id", ctx.orgId);
    if (error) throw new Error(error.message);
    return { clave, confianza: previo.confianza + 1, nuevo: false };
  }
  const { error } = await ctx.supabase.from("lic_entidad_patron").insert({
    org_id: ctx.orgId,
    institucion_id: institucionId,
    clave,
    nota: p.nota,
    valor: p.valor ?? {},
  });
  if (error) throw new Error(error.message);
  return { clave, confianza: 1, nuevo: true };
}

// ===== Importar un proceso analizado a la Bid Room =====

export interface ItemAnalizado {
  numero?: number;
  lote?: number;
  spec_cruda: string;
  cantidad: number;
  unidad?: string;
  marca?: string;
  modelo?: string;
  parte?: string;
  descripcion?: string;
}

export interface Analisis {
  codigo: string;
  objeto?: string;
  modalidad?: string;
  cierre?: string;
  moneda?: "DOP" | "USD";
  adjudicacion?: "item" | "lote" | "total";
  criterio?: "menor_precio" | "calidad_precio" | "calidad";
  plazo_pago_dias?: number;
  resumen?: string;
  lotes?: { numero: number; nombre?: string }[];
  items?: ItemAnalizado[];
  requisitos_estandar?: string[];
  requisitos_extra?: { codigo: string; nombre: string; subsanable: boolean; fuente?: string }[];
  /** Las preguntas de la oferta técnica (PROP-TEC), si el pliego las dice. */
  oferta_tecnica?: { validez_dias?: string; plazo_entrega?: string; lugar_entrega?: string; garantia?: string };
}

export const CODIGOS_REQUISITO = REQUISITOS_ESTANDAR.map((r) => r.codigo);

export async function importarProceso(ctx: Ctx, a: Analisis, dgcp: DgcpProceso | null) {
  const avisos: string[] = [];
  const codigo = a.codigo.trim();

  const inst = await resolverInstitucion(
    ctx,
    { siglas: siglasDesdeCodigo(codigo), nombre: dgcp?.unidad_compra ?? null },
    true,
  );

  const notaPortal = dgcp?.url ? `Portal DGCP: ${dgcp.url.replace("//Public", "/Public")}` : null;
  const notas = [a.resumen?.trim(), notaPortal].filter(Boolean).join("\n\n") || null;

  const campos = {
    objeto: a.objeto?.trim() || dgcp?.titulo || null,
    modalidad: a.modalidad ?? modalidadDesdeDgcp(codigo, dgcp?.modalidad ?? null),
    cierre: a.cierre ?? dgcp?.fecha_fin_recepcion_ofertas ?? null,
    moneda: a.moneda ?? (dgcp?.divisa === "USD" ? "USD" : "DOP"),
    ...(a.adjudicacion ? { adjudicacion: a.adjudicacion } : {}),
    ...(a.criterio ? { criterio: a.criterio } : {}),
    ...(a.plazo_pago_dias != null ? { plazo_pago_dias: a.plazo_pago_dias } : {}),
    institucion_id: inst?.id ?? null,
  };

  // ¿Ya está? Se actualiza la cabecera, pero el trabajo hecho a mano
  // (ítems cotizados, requisitos con archivo) NO se pisa.
  const { data: existente } = await ctx.supabase
    .from("lic_proceso")
    .select("id, notas")
    .eq("org_id", ctx.orgId)
    .eq("codigo", codigo)
    .maybeSingle();

  let procesoId: string;
  if (existente) {
    procesoId = existente.id;
    const notasPrevias = existente.notas?.trim();
    const { error } = await ctx.supabase
      .from("lic_proceso")
      .update({
        ...campos,
        notas: notasPrevias && notas && !notasPrevias.includes(notas) ? `${notasPrevias}\n\n${notas}` : notasPrevias || notas,
      })
      .eq("id", procesoId)
      .eq("org_id", ctx.orgId);
    if (error) throw new Error(`No se pudo actualizar el proceso: ${error.message}`);
  } else {
    const { data, error } = await ctx.supabase
      .from("lic_proceso")
      .insert({ org_id: ctx.orgId, codigo, ...campos, notas, creado_por: ctx.creadoPor, estado: "calificacion" })
      .select("id")
      .single();
    if (error) throw new Error(`No se pudo crear el proceso: ${error.message}`);
    procesoId = data.id;
  }

  // --- Lotes ---
  const loteIds = new Map<number, string>();
  if (a.lotes?.length) {
    const { data, error } = await ctx.supabase
      .from("lic_lote")
      .upsert(
        a.lotes.map((l) => ({ org_id: ctx.orgId, proceso_id: procesoId, numero: l.numero, nombre: l.nombre ?? null })),
        { onConflict: "proceso_id,numero" },
      )
      .select("id, numero");
    if (error) avisos.push(`Lotes: ${error.message}`);
    for (const l of data ?? []) loteIds.set(l.numero, l.id);
  }

  // --- Ítems: solo si el proceso aún no tiene ---
  let itemsCreados = 0;
  if (a.items?.length) {
    const { count } = await ctx.supabase
      .from("lic_item")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .eq("proceso_id", procesoId);
    if ((count ?? 0) > 0) {
      avisos.push(`El proceso ya tenía ${count} ítem(s): no se tocaron. Para corregirlos o agregar líneas usa actualizar_items (ver_bid_room muestra lo que hay).`);
    } else {
      const filas = a.items.map((it, i) => ({
        org_id: ctx.orgId,
        proceso_id: procesoId,
        lote_id: it.lote != null ? (loteIds.get(it.lote) ?? null) : null,
        numero: it.numero ?? i + 1,
        spec_cruda: it.spec_cruda,
        cantidad: it.cantidad,
        unidad: it.unidad?.trim() || "UD",
        marca: it.marca?.trim() || null,
        modelo: it.modelo?.trim() || null,
        parte: it.parte?.trim() || null,
        descripcion: it.descripcion?.trim() || null,
        orden_indice: i,
      }));
      const { error } = await ctx.supabase.from("lic_item").insert(filas);
      if (error) avisos.push(`Ítems: ${error.message}`);
      else itemsCreados = filas.length;
    }
  }

  // --- Requisitos: los que falten, enlazados a la documentación vigente ---
  let requisitosCreados = 0;
  const pedidos = [...new Set(a.requisitos_estandar ?? [])];
  const desconocidos = pedidos.filter((c) => !requisitoEstandar(c));
  if (desconocidos.length) avisos.push(`Códigos de requisito desconocidos (ignorados): ${desconocidos.join(", ")}`);
  if (pedidos.length || a.requisitos_extra?.length) {
    const [{ data: ya }, { data: docs }] = await Promise.all([
      ctx.supabase.from("lic_requisito").select("codigo").eq("org_id", ctx.orgId).eq("proceso_id", procesoId),
      ctx.supabase.from("documento_empresa").select("*").eq("org_id", ctx.orgId),
    ]);
    const yaEstan = new Set((ya ?? []).map((r) => r.codigo));
    const vigentes = coberturaPorTipo((docs ?? []) as DocumentoEmpresa[]);
    const filas = [
      ...pedidos
        .map((c) => requisitoEstandar(c))
        .filter((r): r is NonNullable<typeof r> => !!r && !yaEstan.has(r.codigo))
        .map((r) => {
          const cob = r.docEmpresa ? vigentes[r.docEmpresa] : undefined;
          const doc = cob && !cob.vencido ? cob : undefined;
          return {
            codigo: r.codigo,
            nombre: r.nombre,
            subsanable: r.subsanable,
            fuente: null as string | null,
            firmante_rol: r.subsanable ? "gerente_ventas" : "gerente_general",
            origen: doc ? "documento_empresa" : r.sinArchivo ? "externo" : "plantilla_oficial",
            estado: doc ? "listo" : "pendiente",
            documento_empresa_id: doc?.id ?? null,
          };
        }),
      ...(a.requisitos_extra ?? [])
        .filter((r) => !yaEstan.has(r.codigo.trim()))
        .map((r) => ({
          codigo: r.codigo.trim(),
          nombre: r.nombre.trim(),
          subsanable: r.subsanable,
          fuente: r.fuente?.trim() || null,
          firmante_rol: "gerente_general",
          origen: "externo",
          estado: "pendiente",
          documento_empresa_id: null,
        })),
    ].map((f, i) => ({ ...f, org_id: ctx.orgId, proceso_id: procesoId, orden_indice: yaEstan.size + i }));
    if (filas.length) {
      const { error } = await ctx.supabase.from("lic_requisito").insert(filas);
      if (error) avisos.push(`Requisitos: ${error.message}`);
      else requisitosCreados = filas.length;
    }
  }

  // --- Datos de la oferta técnica: se mezclan con lo ya capturado ---
  if (a.oferta_tecnica) {
    const nuevos = Object.fromEntries(
      Object.entries(a.oferta_tecnica).filter(([, v]) => typeof v === "string" && v.trim()),
    );
    const { data: req } = await ctx.supabase
      .from("lic_requisito")
      .select("id, datos")
      .eq("org_id", ctx.orgId)
      .eq("proceso_id", procesoId)
      .eq("codigo", "PROP-TEC")
      .maybeSingle();
    if (!req) {
      avisos.push("Datos de oferta técnica ignorados: el proceso no tiene el requisito PROP-TEC (agrégalo en requisitos_estandar).");
    } else if (Object.keys(nuevos).length) {
      const { error } = await ctx.supabase
        .from("lic_requisito")
        .update({ datos: { ...((req.datos as Record<string, string>) ?? {}), ...nuevos } })
        .eq("id", req.id)
        .eq("org_id", ctx.orgId);
      if (error) avisos.push(`Oferta técnica: ${error.message}`);
    }
  }

  return {
    proceso_id: procesoId,
    accion: existente ? "actualizado" : "creado",
    institucion: inst?.nombre ?? null,
    items_creados: itemsCreados,
    requisitos_creados: requisitosCreados,
    avisos,
  };
}

// ===== La Bid Room tal como está (para trabajar sobre lo real) =====

async function procesoDeLaOrg(ctx: Ctx, codigo: string) {
  const { data } = await ctx.supabase
    .from("lic_proceso")
    .select("id, codigo, objeto, modalidad, estado, cierre, moneda, adjudicacion, criterio, plazo_pago_dias, notas, institucion(nombre, siglas)")
    .eq("org_id", ctx.orgId)
    .eq("codigo", codigo.trim())
    .maybeSingle();
  if (!data) throw new Error(`${codigo} no está en adjudicado.app todavía: impórtalo con importar_proceso.`);
  return data;
}

export async function verBidRoom(ctx: Ctx, codigo: string) {
  const p = await procesoDeLaOrg(ctx, codigo);
  const [{ data: items }, { data: requisitos }, { data: lotes }, fotos] = await Promise.all([
    ctx.supabase
      .from("lic_item")
      .select("id, numero, lote_id, spec_cruda, cantidad, unidad, marca, modelo, parte, descripcion, ofertamos, motivo_descarte, precio_unitario")
      .eq("org_id", ctx.orgId)
      .eq("proceso_id", p.id)
      .order("orden_indice"),
    ctx.supabase
      .from("lic_requisito")
      .select("codigo, nombre, subsanable, estado, origen, fuente, datos, storage_path")
      .eq("org_id", ctx.orgId)
      .eq("proceso_id", p.id)
      .order("orden_indice"),
    ctx.supabase.from("lic_lote").select("id, numero, nombre").eq("org_id", ctx.orgId).eq("proceso_id", p.id),
    listarImagenesItems(ctx.supabase, ctx.orgId, p.id),
  ]);
  const loteNum = new Map((lotes ?? []).map((l) => [l.id, l.numero]));
  return {
    proceso: { ...p, id: undefined },
    proceso_id: p.id,
    items: (items ?? []).map(({ id, lote_id, precio_unitario, ...it }) => ({
      ...it,
      lote: lote_id ? (loteNum.get(lote_id) ?? null) : null,
      cotizado: precio_unitario !== null,
      tiene_imagen: fotos.has(id),
    })),
    requisitos: (requisitos ?? []).map(({ storage_path, ...r }) => ({ ...r, tiene_archivo: !!storage_path })),
  };
}

// ===== Corregir ítems sin pisar lo que no toca =====

export interface CambioItem {
  numero: number;
  marca?: string | null;
  modelo?: string | null;
  parte?: string | null;
  descripcion?: string | null;
  cantidad?: number;
  unidad?: string;
  ofertamos?: boolean;
  motivo_descarte?: string | null;
}

// La spec_cruda de una línea existente NO se edita (evidencia legal del
// pliego) y los precios tampoco (el costeo es de la persona, en la Bid Room).
export async function actualizarItems(
  ctx: Ctx,
  codigo: string,
  cambios: CambioItem[],
  nuevos: ItemAnalizado[],
) {
  const p = await procesoDeLaOrg(ctx, codigo);
  const { data: existentes } = await ctx.supabase
    .from("lic_item")
    .select("id, numero, orden_indice")
    .eq("org_id", ctx.orgId)
    .eq("proceso_id", p.id);
  const porNumero = new Map((existentes ?? []).map((i) => [i.numero as number, i.id as string]));
  const avisos: string[] = [];
  let actualizados = 0;

  for (const c of cambios) {
    const itemId = porNumero.get(c.numero);
    if (!itemId) {
      avisos.push(`No existe el ítem ${c.numero}: para agregarlo usa «nuevos».`);
      continue;
    }
    const patch: Record<string, unknown> = {};
    for (const k of ["marca", "modelo", "parte", "descripcion", "motivo_descarte"] as const) {
      if (c[k] !== undefined) patch[k] = typeof c[k] === "string" ? (c[k] as string).trim() || null : null;
    }
    if (c.cantidad !== undefined) patch.cantidad = c.cantidad;
    if (c.unidad !== undefined) patch.unidad = c.unidad.trim() || "UD";
    if (c.ofertamos !== undefined) patch.ofertamos = c.ofertamos;
    if (Object.keys(patch).length === 0) continue;
    const { error } = await ctx.supabase.from("lic_item").update(patch).eq("id", itemId).eq("org_id", ctx.orgId);
    if (error) avisos.push(`Ítem ${c.numero}: ${error.message}`);
    else actualizados++;
  }

  let creados = 0;
  if (nuevos.length) {
    let siguiente = Math.max(0, ...porNumero.keys()) + 1;
    let orden = Math.max(-1, ...(existentes ?? []).map((i) => i.orden_indice as number)) + 1;
    const filas = nuevos.map((it) => ({
      org_id: ctx.orgId,
      proceso_id: p.id,
      numero: it.numero && !porNumero.has(it.numero) ? it.numero : siguiente++,
      spec_cruda: it.spec_cruda,
      cantidad: it.cantidad,
      unidad: it.unidad?.trim() || "UD",
      marca: it.marca?.trim() || null,
      modelo: it.modelo?.trim() || null,
      parte: it.parte?.trim() || null,
      descripcion: it.descripcion?.trim() || null,
      orden_indice: orden++,
    }));
    const { error } = await ctx.supabase.from("lic_item").insert(filas);
    if (error) avisos.push(`Ítems nuevos: ${error.message}`);
    else creados = filas.length;
  }
  return { proceso_id: p.id, actualizados, creados, avisos };
}

// ===== Foto del producto de un ítem =====

export async function imagenProducto(ctx: Ctx, codigo: string, numero: number, url: string | null) {
  const p = await procesoDeLaOrg(ctx, codigo);
  const { data: item } = await ctx.supabase
    .from("lic_item")
    .select("id")
    .eq("org_id", ctx.orgId)
    .eq("proceso_id", p.id)
    .eq("numero", numero)
    .maybeSingle();
  if (!item) throw new Error(`No existe el ítem ${numero} en ${codigo}.`);
  if (url === null) {
    const error = await quitarImagenItem(ctx.supabase, ctx.orgId, p.id, item.id);
    if (error) throw new Error(error);
    return { proceso_id: p.id, numero, imagen: "quitada" };
  }
  const bytes = await bajarImagenDeUrl(url);
  const error = await guardarImagenItem(ctx.supabase, ctx.orgId, p.id, item.id, bytes);
  if (error) throw new Error(error);
  return { proceso_id: p.id, numero, imagen: "guardada", kb: Math.round(bytes.length / 1024) };
}
