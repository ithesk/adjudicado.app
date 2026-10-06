"use server";

// Conectores de Claude (MCP): crear y revocar las URLs secretas que se pegan
// en claude.ai. Solo admins — el token abre los datos de licitaciones de la
// empresa. La RLS (es_admin) lo impone igual; esto da el mensaje legible.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMiembro, getUser } from "@/lib/auth";
import { isDemo } from "@/lib/demo";
import { generarToken } from "@/lib/mcp/token";

export interface ConectorMcp {
  id: string;
  nombre: string;
  prefijo: string;
  created_at: string;
  ultimo_uso: string | null;
  revocado_at: string | null;
}

export async function listarConectores(): Promise<ConectorMcp[]> {
  if (isDemo()) return [];
  const miembro = await getMiembro();
  if (!miembro || miembro.rol !== "admin") return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("mcp_token")
    .select("id, nombre, prefijo, created_at, ultimo_uso, revocado_at")
    .eq("org_id", miembro.org_id)
    .order("created_at", { ascending: false });
  return (data ?? []) as ConectorMcp[];
}

// Devuelve el token EN CLARO una sola vez: después solo queda su hash.
export async function crearConector(
  nombre: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  if (isDemo()) return { ok: false, error: "En modo demo no se crean conectores." };
  const miembro = await getMiembro();
  if (!miembro) return { ok: false, error: "No autorizado." };
  if (miembro.rol !== "admin") return { ok: false, error: "Solo un administrador puede crear conectores." };
  const limpio = nombre.trim();
  if (!limpio) return { ok: false, error: "Ponle un nombre (p. ej. «Claude de Pablo»)." };

  const user = await getUser();
  const { token, hash, prefijo } = generarToken();
  const supabase = await createClient();
  const { error } = await supabase.from("mcp_token").insert({
    org_id: miembro.org_id,
    nombre: limpio,
    token_hash: hash,
    prefijo,
    creado_por: user?.id ?? null,
  });
  if (error) return { ok: false, error: `No se pudo crear: ${error.message}` };
  revalidatePath("/configuracion/integraciones");
  return { ok: true, token };
}

export async function revocarConector(id: string): Promise<string | null> {
  if (isDemo()) return "En modo demo no se guardan cambios.";
  const miembro = await getMiembro();
  if (!miembro || miembro.rol !== "admin") return "Solo un administrador puede revocar conectores.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("mcp_token")
    .update({ revocado_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", miembro.org_id);
  if (error) return `No se pudo revocar: ${error.message}`;
  revalidatePath("/configuracion/integraciones");
  return null;
}
