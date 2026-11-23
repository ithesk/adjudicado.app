// Claves del panel del Kindle.
//
// No se reutiliza el token del MCP: ese token también escribe (importa
// procesos, guarda resultados) y el panel vive en un aparato en la mesa.
// Las claves se DERIVAN del hash del token MCP, así que no hace falta tabla
// nueva: quien tiene el token puede calcularlas, revocar el token las
// invalida, y ninguna sirve para el MCP.
//
// Hay dos, con alcances distintos:
//  · pnl_ → solo lectura (GET /api/panel/<clave> y /agenda).
//  · pna_ → solo anotar (POST /api/panel/<clave>/anotar): añadir una nota al
//    proceso y sumar bloques de trabajo. Nada más: ni borrar, ni precios, ni
//    archivos. La de lectura no sirve para anotar ni al revés.

import { createHash, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/mcp/token";

const LECTURA = { prefijo: "pnl_", sal: "panel-solo-lectura" };
const ANOTAR = { prefijo: "pna_", sal: "panel-anotar" };
type Tipo = typeof LECTURA;

function derivar(tipo: Tipo, tokenHash: string): string {
  return tipo.prefijo + createHash("sha256").update(`${tipo.sal}|${tokenHash}`).digest("base64url").slice(0, 32);
}

/** Clave del panel de solo lectura a partir del hash SHA-256 (hex) del token MCP. */
export function claveDesdeHash(tokenHash: string): string {
  return derivar(LECTURA, tokenHash);
}

/** Clave del panel a partir del token MCP en claro (para entregársela al usuario). */
export function claveDesdeToken(token: string): string {
  return claveDesdeHash(hashToken(token));
}

/** Clave de anotar a partir del hash SHA-256 (hex) del token MCP. */
export function claveAnotarDesdeHash(tokenHash: string): string {
  return derivar(ANOTAR, tokenHash);
}

/** Clave de anotar a partir del token MCP en claro. */
export function claveAnotarDesdeToken(token: string): string {
  return claveAnotarDesdeHash(hashToken(token));
}

async function resolver(tipo: Tipo, clave: string): Promise<{ orgId: string } | null> {
  if (!clave.startsWith(tipo.prefijo) || clave.length !== tipo.prefijo.length + 32) return null;
  const supabase = createAdminClient();
  // Hay pocos tokens por instalación: se recorren los vigentes y se compara
  // en tiempo constante.
  const { data } = await supabase.from("mcp_token").select("org_id, token_hash").is("revocado_at", null);
  const buscada = Buffer.from(clave);
  for (const t of data ?? []) {
    const candidata = Buffer.from(derivar(tipo, t.token_hash));
    if (candidata.length === buscada.length && timingSafeEqual(candidata, buscada)) return { orgId: t.org_id };
  }
  return null;
}

/** Clave de lectura → organización, o null si no corresponde a ningún token vigente. */
export function resolverClavePanel(clave: string) {
  return resolver(LECTURA, clave);
}

/** Clave de anotar → organización, o null si no corresponde a ningún token vigente. */
export function resolverClaveAnotar(clave: string) {
  return resolver(ANOTAR, clave);
}
