// Lecturas de la documentación base de la empresa.
// Mismo contrato que el resto de la app: en demo devuelve vacío, sin membresía
// degrada a vacío (no lanza), y la RLS por organización hace el resto.

import { createClient } from "@/lib/supabase/server";
import { getMiembro } from "@/lib/auth";
import { isDemo } from "@/lib/demo";
import type { DocumentoEmpresa } from "./documentos";

export async function listarDocsEmpresa(): Promise<DocumentoEmpresa[]> {
  if (isDemo()) return [];
  const miembro = await getMiembro();
  if (!miembro) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("documento_empresa")
    .select("*")
    .eq("org_id", miembro.org_id)
    .order("created_at", { ascending: false });

  return (data as DocumentoEmpresa[] | null) ?? [];
}
