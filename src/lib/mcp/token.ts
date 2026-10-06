// Tokens del conector MCP. El token va en la URL (/api/mcp/<token>) porque
// claude.ai solo acepta conectores con OAuth o sin auth: una URL secreta es
// lo más simple que funciona en los dos, y se revoca desde Configuración.
// En la base solo vive su SHA-256.

import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const PREFIJO = "adj_";

export function generarToken(): { token: string; hash: string; prefijo: string } {
  const token = PREFIJO + randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token), prefijo: token.slice(0, 10) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface Conexion {
  tokenId: string;
  orgId: string;
  /** Quien creó el token: los procesos importados quedan a su nombre. */
  creadoPor: string | null;
}

// Token → organización, o null si no existe o está revocado.
export async function resolverToken(token: string): Promise<Conexion | null> {
  if (!token.startsWith(PREFIJO) || token.length < 20) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("mcp_token")
    .select("id, org_id, creado_por, ultimo_uso, revocado_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!data || data.revocado_at) return null;
  // El «último uso» se apunta como mucho cada 5 minutos: una sesión de
  // Claude hace decenas de llamadas y no hace falta escribir en cada una.
  const hace = data.ultimo_uso ? Date.now() - new Date(data.ultimo_uso).getTime() : Infinity;
  if (hace > 5 * 60_000) {
    await supabase.from("mcp_token").update({ ultimo_uso: new Date().toISOString() }).eq("id", data.id);
  }
  return { tokenId: data.id, orgId: data.org_id, creadoPor: data.creado_por };
}
