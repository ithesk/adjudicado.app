// Las oportunidades que el barrido programado dejó para esta empresa
// (lic_oportunidad) y cómo estaban las fuentes de la DGCP la última vez
// (dgcp_fuente_salud). Lecturas con la sesión del usuario: la RLS filtra.
//
// Tolerante a que las tablas no existan todavía (supabase_oportunidades.sql
// sin correr): la bandeja no se cae por una tarjeta.

import { createClient } from "@/lib/supabase/server";
import { orgActivaLigera } from "@/lib/auth";
import { isDemo } from "@/lib/demo";

export interface OportunidadDetectada {
  id: string;
  codigo: string;
  titulo: string;
  institucion: string | null;
  modalidad: string | null;
  monto: number | null;
  divisa: string;
  cierre: string | null;
  nivel: "alta" | "media" | "explorar";
  puntaje: number;
  socios: string[];
  origen: "api" | "portal";
  url: string | null;
  visto: boolean;
  detectado_at: string;
}

export interface SaludFuentes {
  revisado_at: string;
  api_ok: boolean;
  api_hasta: string | null;
  portal_ok: boolean;
  portal_hasta: string | null;
  retraso_horas: number | null;
  nuevos_del_portal: number;
  avisos: string[];
}

export async function oportunidadesDetectadas(
  limite = 8,
): Promise<{ filas: OportunidadDetectada[]; salud: SaludFuentes | null }> {
  if (isDemo()) return { filas: [], salud: null };
  const orgId = await orgActivaLigera();
  if (!orgId) return { filas: [], salud: null };
  const sb = await createClient();
  const [ops, salud] = await Promise.all([
    sb
      .from("lic_oportunidad")
      .select("id, codigo, titulo, institucion, modalidad, monto, divisa, cierre, nivel, puntaje, socios, origen, url, visto, detectado_at")
      .eq("org_id", orgId)
      .eq("descartada", false)
      .gt("cierre", new Date().toISOString())
      .order("puntaje", { ascending: false })
      .order("cierre", { ascending: true })
      .limit(limite),
    sb
      .from("dgcp_fuente_salud")
      .select("revisado_at, api_ok, api_hasta, portal_ok, portal_hasta, retraso_horas, nuevos_del_portal, avisos")
      .order("revisado_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    filas: (ops.error ? [] : (ops.data ?? [])) as OportunidadDetectada[],
    salud: (salud.error ? null : salud.data) as SaludFuentes | null,
  };
}

/** Lo que la bandeja debe decir de las fuentes, o null si todo va bien. */
export function alertaFuentes(salud: SaludFuentes | null, ahora = new Date()): string | null {
  if (!salud) return null;
  const horasDesde = (ahora.getTime() - new Date(salud.revisado_at).getTime()) / 3_600_000;
  if (horasDesde > 36) return `El barrido de oportunidades no corre desde hace ${Math.round(horasDesde / 24)} día(s).`;
  if (!salud.api_ok && !salud.portal_ok) return "Ni datos abiertos ni el portal de la DGCP respondieron en el último barrido.";
  if (!salud.portal_ok) return "El portal de ComprasDominicana no se pudo leer: puede faltar lo publicado hoy.";
  if (!salud.api_ok) return "Datos abiertos de la DGCP no respondió: solo se vio lo del portal.";
  if ((salud.retraso_horas ?? 0) > 24) {
    return `Datos abiertos de la DGCP lleva ${Math.round(salud.retraso_horas!)} h sin actualizarse; lo nuevo sale del portal.`;
  }
  return null;
}
