// Capa de datos del módulo de Licitaciones. Lecturas con orgActivaLigera()
// (el guard real es la RLS es_miembro); mutaciones con getMiembro() y el
// .eq("org_id") defensivo. Las mutaciones devuelven string | null (error).
//
// Excepción medida: crearItem() usa orgActivaLigera(). getMiembro() cuesta un
// viaje de red a Supabase Auth, y en una server action nada lo tiene ya
// resuelto — se pagaba entero en el clic de «Agregar línea». El insert lo
// protege la RLS (`with check (es_miembro(org_id))`), así que un org_id
// falsificado en la cookie lo rechaza SQL, no la cookie.

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getMiembro, getUser, orgActivaLigera } from "@/lib/auth";
import { isDemo } from "@/lib/demo";
import { ProcesoCanonico, traducirIssue } from "./contrato";
import { paramsCotizacion, precioBaseUnitario, precioVentaUnitario } from "./cotizador";
import { requisitoEstandar } from "./requisitos-estandar";
import {
  estadoDocumentacion,
  type DocumentoEmpresa,
} from "@/lib/empresa/documentos";
import type {
  EmpresaPerfil,
  LicFirmante,
  LicItem,
  LicProceso,
  LicRequisito,
  ProcesoDetalle,
  RolFirmante,
} from "./tipos";

// ===== Empresa (perfil + firmantes) =====

export async function perfilEmpresa(): Promise<EmpresaPerfil | null> {
  if (isDemo()) return null;
  const orgId = await orgActivaLigera();
  if (!orgId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("empresa_perfil")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  return (data as EmpresaPerfil | null) ?? null;
}

export async function listarFirmantes(): Promise<LicFirmante[]> {
  if (isDemo()) return [];
  const orgId = await orgActivaLigera();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("lic_firmante")
    .select("*")
    .eq("org_id", orgId)
    .order("rol");
  return (data as LicFirmante[] | null) ?? [];
}

// Autosave: recibe SOLO los campos que cambiaron. Si el perfil no existe
// todavía, lo crea con la razón social pre-poblada desde el nombre de la
// organización (fricción cero: no hay "formulario inicial").
export async function guardarPerfil(
  patch: Partial<Omit<EmpresaPerfil, "org_id" | "updated_at">>,
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();

  // Actualizar la tasa deja constancia de cuándo (para avisar si envejece).
  const conFecha =
    "tasa_usd_dop" in patch && !("tasa_fecha" in patch)
      ? { ...patch, tasa_fecha: new Date().toISOString().slice(0, 10) }
      : patch;

  const { data: existe } = await supabase
    .from("empresa_perfil")
    .select("org_id")
    .eq("org_id", miembro.org_id)
    .maybeSingle();

  const { error } = existe
    ? await supabase
        .from("empresa_perfil")
        .update(conFecha)
        .eq("org_id", miembro.org_id)
    : await supabase.from("empresa_perfil").insert({
        nombre_legal: miembro.organizacion?.nombre ?? "Mi empresa",
        ...conFecha,
        org_id: miembro.org_id,
      });
  // La RLS exige rol admin para escribir el perfil (datos fiscales).
  return error ? `No se pudo guardar (¿eres admin?): ${error.message}` : null;
}

export async function guardarFirmante(
  rol: RolFirmante,
  datos: { nombre: string; cedula: string | null; cargo: string | null },
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  const nombre = datos.nombre.trim();
  if (!nombre) return "El nombre es obligatorio.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("lic_firmante")
    .upsert(
      { org_id: miembro.org_id, rol, nombre, cedula: datos.cedula, cargo: datos.cargo },
      { onConflict: "org_id,rol" },
    );
  return error ? `No se pudo guardar (¿eres admin?): ${error.message}` : null;
}

// ===== Procesos =====

export async function listarProcesos(): Promise<LicProceso[]> {
  if (isDemo()) return [];
  const orgId = await orgActivaLigera();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("lic_proceso")
    .select("*")
    .eq("org_id", orgId)
    .order("cierre", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  return (data as LicProceso[] | null) ?? [];
}

// Los paquetes YA generados de un proceso — para descargarlos directo del
// respaldo sin volver a generar nada.
export async function listarPaquetes(
  procesoId: string,
): Promise<{ version: number; storage_path: string; generado_at: string }[]> {
  if (isDemo()) return [];
  const orgId = await orgActivaLigera();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("lic_paquete")
    .select("version, storage_path, generado_at")
    .eq("proceso_id", procesoId)
    .eq("org_id", orgId)
    .not("storage_path", "is", null)
    .order("version", { ascending: false })
    .limit(5);
  return (data ?? []) as { version: number; storage_path: string; generado_at: string }[];
}

// Para la lista: qué procesos tienen una subsanación ABIERTA y su límite —
// ese reloj manda sobre el del cierre.
export async function subsanacionesAbiertas(): Promise<Record<string, string>> {
  if (isDemo()) return {};
  const orgId = await orgActivaLigera();
  if (!orgId) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("lic_subsanacion")
    .select("proceso_id, fecha_limite")
    .eq("org_id", orgId)
    .eq("estado", "abierta");
  return Object.fromEntries(
    (data ?? []).map((s) => [s.proceso_id, s.fecha_limite]),
  );
}

export async function obtenerProceso(id: string): Promise<ProcesoDetalle | null> {
  if (isDemo()) return null;
  const orgId = await orgActivaLigera();
  if (!orgId) return null;
  const supabase = await createClient();

  const { data: proceso } = await supabase
    .from("lic_proceso")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!proceso) return null;

  const [lotes, items, requisitos, institucion, subsanacion] = await Promise.all([
    supabase.from("lic_lote").select("*").eq("proceso_id", id).order("numero"),
    supabase
      .from("lic_item")
      .select("*")
      .eq("proceso_id", id)
      .order("orden_indice")
      .order("numero"),
    supabase
      .from("lic_requisito")
      .select("*")
      .eq("proceso_id", id)
      .order("orden_indice")
      .order("codigo"),
    proceso.institucion_id
      ? supabase
          .from("institucion")
          .select("id, nombre, siglas")
          .eq("id", proceso.institucion_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("lic_subsanacion")
      .select("id, proceso_id, fecha_limite, texto, estado, enviada_at, created_at")
      .eq("proceso_id", id)
      .neq("estado", "cerrada")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    proceso: proceso as LicProceso,
    lotes: (lotes.data ?? []) as ProcesoDetalle["lotes"],
    items: (items.data ?? []) as LicItem[],
    requisitos: (requisitos.data ?? []) as LicRequisito[],
    institucion: (institucion.data ?? null) as ProcesoDetalle["institucion"],
    subsanacion: (subsanacion.data ?? null) as ProcesoDetalle["subsanacion"],
  };
}

export interface NuevoProceso {
  codigo: string;
  objeto: string;
  modalidad: string;
  cierre: string | null; // datetime-local
  institucion_id: string | null;
  institucion_nueva: string | null; // crea la institución si no existe
  adjudicacion: "item" | "lote" | "total";
  criterio: "menor_precio" | "calidad_precio" | "calidad";
}

export async function crearProceso(
  datos: NuevoProceso,
): Promise<{ id?: string; error?: string }> {
  if (isDemo()) return { error: "En modo demo no se crean procesos." };
  const codigo = datos.codigo.trim();
  if (!codigo) return { error: "El código del proceso es obligatorio." };
  const miembro = await getMiembro();
  if (!miembro) return { error: "No autorizado." };
  const user = await getUser();
  const supabase = await createClient();

  let institucionId = datos.institucion_id;
  const nombreNueva = datos.institucion_nueva?.trim();
  if (!institucionId && nombreNueva) {
    const { data: inst } = await supabase
      .from("institucion")
      .insert({ org_id: miembro.org_id, nombre: nombreNueva })
      .select("id")
      .single();
    institucionId = inst?.id ?? null;
  }

  const { data, error } = await supabase
    .from("lic_proceso")
    .insert({
      org_id: miembro.org_id,
      codigo,
      objeto: datos.objeto.trim() || null,
      modalidad: datos.modalidad,
      cierre: datos.cierre || null,
      institucion_id: institucionId,
      adjudicacion: datos.adjudicacion,
      criterio: datos.criterio,
      creado_por: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: `Ya existe un proceso con el código ${codigo}.` };
    return { error: `No se pudo crear: ${error.message}` };
  }
  return { id: data.id };
}

export async function actualizarProceso(
  id: string,
  patch: Partial<
    Pick<
      LicProceso,
      | "objeto"
      | "modalidad"
      | "cierre"
      | "estado"
      | "moneda"
      | "adjudicacion"
      | "criterio"
      | "plazo_pago_dias"
      | "institucion_id"
      | "tasa_usd_dop"
      | "margen_pct"
      | "itbis_pct"
      | "notas"
    >
  >,
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("lic_proceso")
    .update(patch)
    .eq("id", id)
    .eq("org_id", miembro.org_id);
  return error ? `No se pudo guardar: ${error.message}` : null;
}

export async function eliminarProceso(id: string): Promise<string | null> {
  if (isDemo()) return "En modo demo no se borra.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("lic_proceso")
    .delete()
    .eq("id", id)
    .eq("org_id", miembro.org_id);
  return error ? `No se pudo eliminar: ${error.message}` : null;
}

// ===== Ítems =====

// Devuelve la línea CREADA (no solo el error): el cotizador la pinta al
// instante en vez de esperar a que el servidor vuelva a renderizar la página.
export async function crearItem(
  procesoId: string,
): Promise<{ item: LicItem | null; error: string | null }> {
  if (isDemo()) return { item: null, error: "En modo demo no se guardan cambios." };
  const orgId = await orgActivaLigera();
  if (!orgId) return { item: null, error: "No autorizado." };
  const supabase = await createClient();
  const { data: max } = await supabase
    .from("lic_item")
    .select("numero")
    .eq("proceso_id", procesoId)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("lic_item")
    .insert({
      org_id: orgId,
      proceso_id: procesoId,
      numero: (max?.numero ?? 0) + 1,
      spec_cruda: "",
      orden_indice: max?.numero ?? 0,
    })
    .select("*")
    .single();
  if (error) return { item: null, error: `No se pudo agregar el ítem: ${error.message}` };
  return { item: data as LicItem, error: null };
}

export async function actualizarItem(
  id: string,
  patch: Partial<
    Pick<
      LicItem,
      | "spec_cruda"
      | "cantidad"
      | "unidad"
      | "marca"
      | "modelo"
      | "parte"
      | "descripcion"
      | "ofertamos"
      | "motivo_descarte"
      | "precio_unitario"
      | "itbis_modo"
    >
  >,
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();
  // itbis_aplica es derivada del modo — se mantiene en sync para que los
  // payloads históricos y el contrato sigan siendo válidos.
  const conModo =
    "itbis_modo" in patch && patch.itbis_modo
      ? { ...patch, itbis_aplica: patch.itbis_modo !== "exento" }
      : patch;
  // Un precio tecleado a mano invalida el snapshot del catálogo.
  const conLimpieza =
    "precio_unitario" in conModo
      ? { ...conModo, suplidor_id: null, sku: null, costo_usd: null, tasa: null, margen_pct: null, margen_modo: null }
      : conModo;
  const { error } = await supabase
    .from("lic_item")
    .update(conLimpieza)
    .eq("id", id)
    .eq("org_id", miembro.org_id);
  return error ? `No se pudo guardar: ${error.message}` : null;
}

// Reordena las líneas ARRASTRADAS: recibe los ids en el orden final de la
// pantalla y reescribe orden_indice secuencial (normaliza duplicados
// heredados). El orden en pantalla es el orden del F.033; el número del
// pliego no cambia (es identidad del pliego, no posición).
export async function reordenarItems(
  procesoId: string,
  ids: string[],
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();
  const errores = await Promise.all(
    ids.map(async (itemId, i) => {
      const { error } = await supabase
        .from("lic_item")
        .update({ orden_indice: i })
        .eq("id", itemId)
        .eq("proceso_id", procesoId)
        .eq("org_id", miembro.org_id);
      return error;
    }),
  );
  const err = errores.find(Boolean);
  return err ? `No se pudo reordenar: ${err.message}` : null;
}

export async function eliminarItem(id: string): Promise<string | null> {
  if (isDemo()) return "En modo demo no se borra.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("lic_item")
    .delete()
    .eq("id", id)
    .eq("org_id", miembro.org_id);
  return error ? `No se pudo eliminar: ${error.message}` : null;
}

// Cotiza un ítem desde el catálogo de Precios: congela el snapshot completo
// (costo, tasa, margen y el precio resultante). El cálculo vive en el módulo
// puro `cotizador` — el mismo que usa la vista previa del cliente.
export async function cotizarItemCatalogo(
  itemId: string,
  origen: { suplidor_id: string; sku: string; costo_usd: number },
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("lic_item")
    .select("id, proceso_id")
    .eq("id", itemId)
    .eq("org_id", miembro.org_id)
    .maybeSingle();
  if (!item) return "Ítem no encontrado.";

  const [{ data: proceso }, { data: perfil }] = await Promise.all([
    supabase
      .from("lic_proceso")
      .select("tasa_usd_dop, margen_pct, itbis_pct")
      .eq("id", item.proceso_id)
      .maybeSingle(),
    supabase
      .from("empresa_perfil")
      .select("tasa_usd_dop, margen_pct, margen_modo, itbis_pct")
      .eq("org_id", miembro.org_id)
      .maybeSingle(),
  ]);
  if (!proceso) return "Proceso no encontrado.";

  const params = paramsCotizacion(proceso, perfil ?? null);
  if (params.tasa === null) {
    return "Configura la tasa USD→DOP en Configuración → Empresa antes de cotizar.";
  }
  const precio = precioVentaUnitario(origen.costo_usd, params);
  if (precio === null) return "No se pudo calcular el precio con esos parámetros.";

  const { error } = await supabase
    .from("lic_item")
    .update({
      suplidor_id: origen.suplidor_id,
      sku: origen.sku,
      costo_usd: origen.costo_usd,
      tasa: params.tasa,
      margen_pct: params.margenPct,
      margen_modo: params.margenModo,
      precio_unitario: precio,
    })
    .eq("id", itemId)
    .eq("org_id", miembro.org_id);
  return error ? `No se pudo cotizar: ${error.message}` : null;
}

// ===== Requisitos =====

export async function crearRequisito(
  procesoId: string,
  datos: {
    codigo: string;
    nombre: string;
    subsanable: boolean;
    firmante_rol: LicRequisito["firmante_rol"];
    fuente: string | null;
  },
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  const codigo = datos.codigo.trim();
  const nombre = datos.nombre.trim();
  if (!codigo || !nombre) return "Código y nombre son obligatorios.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();
  const { error } = await supabase.from("lic_requisito").insert({
    org_id: miembro.org_id,
    proceso_id: procesoId,
    codigo,
    nombre,
    subsanable: datos.subsanable,
    firmante_rol: datos.firmante_rol,
    fuente: datos.fuente,
  });
  if (error?.code === "23505") return `Ya existe el requisito ${codigo} en este proceso.`;
  return error ? `No se pudo agregar: ${error.message}` : null;
}

export async function actualizarRequisito(
  id: string,
  patch: Partial<
    Pick<LicRequisito, "nombre" | "subsanable" | "fuente" | "firmante_rol" | "estado" | "datos">
  >,
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("lic_requisito")
    .update(patch)
    .eq("id", id)
    .eq("org_id", miembro.org_id);
  return error ? `No se pudo guardar: ${error.message}` : null;
}

export async function eliminarRequisito(id: string): Promise<string | null> {
  if (isDemo()) return "En modo demo no se borra.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("lic_requisito")
    .delete()
    .eq("id", id)
    .eq("org_id", miembro.org_id);
  return error ? `No se pudo eliminar: ${error.message}` : null;
}

// ===== Subsanación =====
// La entidad pide por correo documentos faltantes/corregidos con fecha
// límite. Se registra, se marcan los requisitos pedidos y el paquete de
// subsanación sale solo con eso. El movimiento queda en la bitácora de la
// entidad del proceso.

async function eventoEntidadDelProceso(
  procesoId: string,
  orgId: string,
  texto: string,
) {
  const supabase = await createClient();
  const { data: proc } = await supabase
    .from("lic_proceso")
    .select("institucion_id, codigo")
    .eq("id", procesoId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!proc?.institucion_id) return;
  const user = await getUser();
  await supabase.from("institucion_evento").insert({
    org_id: orgId,
    institucion_id: proc.institucion_id,
    autor_id: user?.id ?? null,
    tipo: "subsanacion",
    texto: `${texto} (${proc.codigo})`,
  });
}

export async function crearSubsanacion(
  procesoId: string,
  fechaLimite: string, // "YYYY-MM-DDTHH:mm" del datetime-local
  texto: string,
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  if (!fechaLimite) return "La fecha límite es obligatoria — es lo que manda aquí.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();
  // Una sola viva por proceso: si hay una abierta/enviada, no se apila otra.
  const { data: viva } = await supabase
    .from("lic_subsanacion")
    .select("id")
    .eq("proceso_id", procesoId)
    .eq("org_id", miembro.org_id)
    .neq("estado", "cerrada")
    .limit(1)
    .maybeSingle();
  if (viva) return "Ya hay una subsanación en curso — ciérrala antes de registrar otra.";
  const { error } = await supabase.from("lic_subsanacion").insert({
    org_id: miembro.org_id,
    proceso_id: procesoId,
    fecha_limite: fechaLimite,
    texto: texto.trim() || null,
  });
  if (error) return `No se pudo registrar: ${error.message}`;
  await eventoEntidadDelProceso(
    procesoId,
    miembro.org_id,
    `Pidió una subsanación con límite ${fechaLimite.slice(8, 10)}/${fechaLimite.slice(5, 7)}`,
  );
  return null;
}

export async function cambiarEstadoSubsanacion(
  id: string,
  estado: "enviada" | "cerrada",
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();
  const { data: fila, error } = await supabase
    .from("lic_subsanacion")
    .update({
      estado,
      ...(estado === "enviada" ? { enviada_at: new Date().toISOString() } : {}),
    })
    .eq("id", id)
    .eq("org_id", miembro.org_id)
    .select("proceso_id")
    .maybeSingle();
  if (error) return `No se pudo actualizar: ${error.message}`;
  if (fila) {
    await eventoEntidadDelProceso(
      fila.proceso_id,
      miembro.org_id,
      estado === "enviada"
        ? "Se le envió la subsanación"
        : "Se cerró la subsanación",
    );
  }
  return null;
}

// Marcar un requisito como pedido lo devuelve a "pendiente" (hay que
// rehacerlo o volverlo a subir); desmarcarlo solo quita la marca.
export async function toggleRequisitoSubsanacion(
  requisitoId: string,
  subsanacionId: string | null,
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("lic_requisito")
    .update(
      subsanacionId
        ? { subsanacion_id: subsanacionId, estado: "pendiente" }
        : { subsanacion_id: null },
    )
    .eq("id", requisitoId)
    .eq("org_id", miembro.org_id);
  return error ? `No se pudo guardar: ${error.message}` : null;
}

// Agrega de un golpe los requisitos marcados del checklist estándar.
// Si un requisito lo satisface un documento de la empresa VIGENTE
// (Configuración → Empresa), nace enlazado y listo; si el documento está
// vencido o falta, nace pendiente (y la insignia de Empresa ya lo grita).
export async function crearRequisitosLote(
  procesoId: string,
  codigos: string[],
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  if (codigos.length === 0) return "Marca al menos un requisito.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";
  const supabase = await createClient();

  const [{ data: existentes }, { data: docs }, { data: plantillasOrg }] = await Promise.all([
    supabase.from("lic_requisito").select("codigo").eq("proceso_id", procesoId),
    supabase
      .from("documento_empresa")
      .select("*")
      .eq("org_id", miembro.org_id),
    supabase
      .from("lic_plantilla")
      .select("codigo, nombre")
      .eq("org_id", miembro.org_id)
      .eq("estado", "lista"),
  ]);
  const yaEstan = new Set((existentes ?? []).map((r) => r.codigo));
  const plantillaPorCodigo = new Map(
    (plantillasOrg ?? []).map((p) => [p.codigo as string, p.nombre as string]),
  );

  // El documento vigente de cada tipo (mismo criterio que la pantalla Empresa).
  const vigentes = new Map(
    estadoDocumentacion((docs ?? []) as DocumentoEmpresa[])
      .filter((f) => f.vigente && f.nivel !== "vencido")
      .map((f) => [f.tipo.codigo, f.vigente!]),
  );

  const filas = codigos
    .filter((c) => !yaEstan.has(c))
    .map((c, i) => {
      const r = requisitoEstandar(c);
      if (r) {
        const doc = r.docEmpresa ? vigentes.get(r.docEmpresa) : undefined;
        return {
          org_id: miembro.org_id,
          proceso_id: procesoId,
          codigo: r.codigo,
          nombre: r.nombre,
          subsanable: r.subsanable,
          firmante_rol: r.subsanable ? "gerente_ventas" : "gerente_general",
          origen: doc ? "documento_empresa" : r.sinArchivo ? "externo" : "plantilla_oficial",
          estado: doc ? "listo" : "pendiente",
          documento_empresa_id: doc?.id ?? null,
          orden_indice: i,
        };
      }
      // Plantilla del constructor de la organización.
      const nombre = plantillaPorCodigo.get(c);
      if (!nombre) return null;
      return {
        org_id: miembro.org_id,
        proceso_id: procesoId,
        codigo: c,
        nombre,
        subsanable: true,
        firmante_rol: "gerente_general",
        origen: "generado",
        estado: "pendiente",
        documento_empresa_id: null,
        orden_indice: i,
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);
  if (filas.length === 0) return null; // todo ya estaba

  const { error } = await supabase.from("lic_requisito").insert(filas);
  return error ? `No se pudieron agregar: ${error.message}` : null;
}

const MAX_MB = 15;

// Sube el archivo de un requisito y lo marca listo.
export async function subirArchivoRequisito(
  requisitoId: string,
  formData: FormData,
): Promise<string | null> {
  if (isDemo()) return "En modo demo no se suben archivos.";
  const miembro = await getMiembro();
  if (!miembro) return "No autorizado.";

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return "Elige un archivo.";
  if (archivo.size > MAX_MB * 1024 * 1024) return `El archivo pesa más de ${MAX_MB} MB.`;

  const supabase = await createClient();
  const { data: req } = await supabase
    .from("lic_requisito")
    .select("id, proceso_id")
    .eq("id", requisitoId)
    .eq("org_id", miembro.org_id)
    .maybeSingle();
  if (!req) return "Requisito no encontrado.";

  const ext = (archivo.name.split(".").pop() || "bin").toLowerCase();
  const path = `${miembro.org_id}/licitaciones/${req.proceso_id}/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const { error: errSubida } = await supabase.storage
    .from("documentos")
    .upload(path, bytes, {
      contentType: archivo.type || "application/octet-stream",
    });
  if (errSubida) return `No se pudo subir: ${errSubida.message}`;

  const { error } = await supabase
    .from("lic_requisito")
    .update({ storage_path: path, estado: "listo" })
    .eq("id", requisitoId)
    .eq("org_id", miembro.org_id);
  if (error) {
    await supabase.storage.from("documentos").remove([path]);
    return `No se pudo guardar: ${error.message}`;
  }
  return null;
}

// ===== El JSON canónico =====

export interface ResultadoCanonico {
  canonico?: unknown;
  errores?: string[];
}

// Arma el JSON canónico del proceso desde la base y lo valida contra el
// contrato (Fase 1). Los errores salen legibles: son la lista de "qué falta"
// para que el expediente esté completo.
export async function construirCanonico(procesoId: string): Promise<ResultadoCanonico> {
  const detalle = await obtenerProceso(procesoId);
  if (!detalle) return { errores: ["Proceso no encontrado."] };
  const [perfil, firmantes] = await Promise.all([perfilEmpresa(), listarFirmantes()]);

  const { proceso, lotes, items, requisitos, institucion } = detalle;
  const params = paramsCotizacion(proceso, perfil);

  // Lotes: los definidos + uno sintético para los ítems sin lote.
  const porLote = new Map<string | null, LicItem[]>();
  for (const it of items) {
    const k = it.lote_id ?? null;
    porLote.set(k, [...(porLote.get(k) ?? []), it]);
  }
  const lotesCanon = lotes
    .filter((l) => (porLote.get(l.id) ?? []).length > 0)
    .map((l) => ({
      numero: l.numero,
      nombre: l.nombre ?? undefined,
      items: (porLote.get(l.id) ?? []).map(itemCanon),
    }));
  const sueltos = porLote.get(null) ?? [];
  if (sueltos.length > 0) {
    lotesCanon.push({
      numero: (lotes.at(-1)?.numero ?? 0) + 1,
      nombre: lotes.length > 0 ? "Ítems sin lote" : undefined,
      items: sueltos.map(itemCanon),
    });
  }

  const loteDeItem = new Map<number, number>();
  for (const lc of lotesCanon) for (const it of lc.items) loteDeItem.set(it.numero, lc.numero);

  const lineas = items
    .filter((i) => i.ofertamos && i.precio_unitario !== null)
    .map((i) => ({
      item: i.numero,
      lote: loteDeItem.get(i.numero),
      suplidor_id: i.suplidor_id ?? undefined,
      sku: i.sku ?? undefined,
      costo_usd: i.costo_usd ?? undefined,
      tasa: i.tasa ?? undefined,
      margen_pct: i.margen_pct ?? undefined,
      margen_modo: i.margen_modo ?? undefined,
      // El contrato exige la BASE sin ITBIS: si el precio se tecleó con el
      // ITBIS incluido, aquí se despeja — el F.033 y las letras no cambian.
      precio_unitario: precioBaseUnitario(
        i.precio_unitario as number,
        i.itbis_modo,
        params.itbisPct,
      ),
      itbis_aplica: i.itbis_modo !== "exento",
    }));

  const supabase = await createClient();
  const { data: ultimo } = await supabase
    .from("lic_paquete")
    .select("version")
    .eq("proceso_id", procesoId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const candidato = {
    meta: {
      id: proceso.id,
      org_id: proceso.org_id,
      version: (ultimo?.version ?? 0) + 1,
      generado_en: new Date().toISOString(),
    },
    proceso: {
      codigo: proceso.codigo,
      modalidad: proceso.modalidad,
      objeto: proceso.objeto ?? "",
      entidad: {
        nombre: institucion?.nombre ?? "",
        siglas: institucion?.siglas ?? institucion?.nombre ?? "",
      },
      cronograma: { cierre: proceso.cierre ?? "" },
      moneda: proceso.moneda,
      plazo_pago_dias: proceso.plazo_pago_dias ?? undefined,
      adjudicacion: proceso.adjudicacion,
      criterio: proceso.criterio,
    },
    oferente: {
      razon_social: perfil?.nombre_legal ?? "",
      rnc: perfil?.rnc ?? "",
      rpe: perfil?.rpe ?? "",
      direccion: perfil?.direccion ?? "",
      telefono: perfil?.telefono ?? "",
      email: perfil?.email ?? "",
    },
    firmantes: firmantes.map((f) => ({
      rol: f.rol,
      nombre: f.nombre,
      cedula: f.cedula ?? undefined,
      cargo: f.cargo ?? ROL_CARGO[f.rol],
    })),
    lotes: lotesCanon,
    requisitos: requisitos.map((r) => ({
      codigo: r.codigo,
      nombre: r.nombre,
      subsanable: r.subsanable,
      fuente: r.fuente ?? undefined,
      firmante_rol: r.firmante_rol,
      origen: r.origen,
      estado: r.estado,
      documento_empresa_id: r.documento_empresa_id ?? undefined,
      storage_path: r.storage_path ?? undefined,
    })),
    economico:
      lineas.length > 0 ? { itbis_pct: params.itbisPct, lineas } : undefined,
  };

  const r = ProcesoCanonico.safeParse(candidato);
  if (r.success) return { canonico: r.data };
  // Sin duplicados: varios issues de Zod pueden traducir al mismo consejo.
  return { errores: [...new Set(r.error.issues.map((i) => traducirIssue(i.path, i.message)))] };
}

const ROL_CARGO: Record<string, string> = {
  gerente_general: "Gerente General",
  gerente_ventas: "Gerente de Ventas",
};

function itemCanon(i: LicItem) {
  const producto =
    i.marca && i.modelo && i.descripcion
      ? {
          marca: i.marca,
          modelo: i.modelo,
          parte: i.parte ?? undefined,
          descripcion: i.descripcion,
        }
      : undefined;
  return {
    numero: i.numero,
    spec_cruda: i.spec_cruda,
    cantidad: Number(i.cantidad),
    unidad: i.unidad,
    producto,
    ofertamos: i.ofertamos,
    motivo_descarte: i.motivo_descarte ?? undefined,
  };
}
