// Clave del panel de solo lectura (GET /api/panel/<clave>).
//
// No se reutiliza el token del MCP: ese token también escribe (importa
// procesos, guarda resultados) y el panel vive en un aparato en la mesa.
// La clave del panel se DERIVA del hash del token MCP, así que no hace falta
// tabla nueva: quien tiene el token puede calcularla, revocar el token la
// invalida, y la clave sola no sirve para el MCP.

import { createHash, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/mcp/token";

const PREFIJO = "pnl_";

/** Clave del panel a partir del hash SHA-256 (hex) del token MCP. */
export function claveDesdeHash(tokenHash: string): string {
  return PREFIJO + createHash("sha256").update(`panel-solo-lectura|${tokenHash}`).digest("base64url").slice(0, 32);
}

/** Clave del panel a partir del token MCP en claro (para entregársela al usuario). */
export function claveDesdeToken(token: string): string {
  return claveDesdeHash(hashToken(token));
}

/** Clave → organización, o null si no corresponde a ningún token vigente. */
export async function resolverClavePanel(clave: string): Promise<{ orgId: string } | null> {
  if (!clave.startsWith(PREFIJO) || clave.length !== PREFIJO.length + 32) return null;
  const supabase = createAdminClient();
  // Hay pocos tokens por instalación: se recorren los vigentes y se compara
  // en tiempo constante.
  const { data } = await supabase.from("mcp_token").select("org_id, token_hash").is("revocado_at", null);
  const buscada = Buffer.from(clave);
  for (const t of data ?? []) {
    const candidata = Buffer.from(claveDesdeHash(t.token_hash));
    if (candidata.length === buscada.length && timingSafeEqual(candidata, buscada)) return { orgId: t.org_id };
  }
  return null;
}
