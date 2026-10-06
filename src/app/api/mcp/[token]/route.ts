// Endpoint MCP de adjudicado.app: https://<app>/api/mcp/<token>
//
// Se agrega en claude.ai → Configuración → Conectores → «Agregar conector
// personalizado» pegando la URL completa (la crea un admin en Configuración
// → Integraciones). El token identifica la organización; ver token.ts.
//
// Sin sesión ni SSE: cada POST es independiente (protocolo.ts). GET y
// DELETE responden 405, que es como el estándar dice «aquí no hay stream».

import { NextResponse, type NextRequest } from "next/server";
import { resolverToken } from "@/lib/mcp/token";
import { contexto } from "@/lib/mcp/datos";
import { HERRAMIENTAS, type CtxHerramienta } from "@/lib/mcp/herramientas";
import { atender } from "@/lib/mcp/protocolo";

export const runtime = "nodejs";
// Escanear 7 páginas de la DGCP o bajar un pliego de 5 MB cabe de sobra,
// pero el portal a veces va lento.
export const maxDuration = 60;

function noPermitido() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
export const GET = noPermitido;
export const DELETE = noPermitido;

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const conexion = await resolverToken(token);
  if (!conexion) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Conector no válido o revocado." } },
      { status: 401 },
    );
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } }, { status: 400 });
  }

  // El contexto (cliente de base) solo se arma si alguna herramienta corre.
  const host = req.headers.get("x-forwarded-host");
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0] ?? req.nextUrl.protocol.replace(":", "");
  const origen = host ? `${proto}://${host}` : req.nextUrl.origin;
  const ctx = async (): Promise<CtxHerramienta> => ({
    ...contexto(conexion.orgId, conexion.creadoPor),
    baseUrl: origen,
  });

  const lote = Array.isArray(cuerpo);
  const mensajes = lote ? (cuerpo as unknown[]) : [cuerpo];
  const respuestas = (await Promise.all(mensajes.map((m) => atender(m, HERRAMIENTAS, ctx)))).filter(
    (r) => r !== null,
  );

  // Solo notificaciones → 202 sin cuerpo (lo que pide el estándar).
  if (respuestas.length === 0) return new NextResponse(null, { status: 202 });
  return NextResponse.json(lote ? respuestas : respuestas[0]);
}
