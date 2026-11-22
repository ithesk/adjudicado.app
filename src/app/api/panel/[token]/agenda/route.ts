// Agenda de cierres para el panel del Kindle: GET /api/panel/<clave>/agenda.
// Escanea la DGCP (API + portal) como buscar_oportunidades, así que tarda
// unos segundos: el Kindle la pide cada 30 minutos, no cada minuto.

import { NextResponse, type NextRequest } from "next/server";
import { listarAbiertos } from "@/lib/dgcp/fuentes";
import { radar } from "@/lib/dgcp/relevancia";
import { capacidades, contexto, procesosPorCodigo } from "@/lib/mcp/datos";
import { resolverClavePanel } from "@/lib/panel/clave";
import { armarAgenda } from "@/lib/panel/agenda";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const conexion = await resolverClavePanel(token);
  if (!conexion) return NextResponse.json({ error: "Clave no válida o revocada." }, { status: 401 });

  const ctx = contexto(conexion.orgId, null);
  const [{ procesos, frescura }, caps] = await Promise.all([listarAbiertos(), capacidades(ctx)]);
  const oportunidades = radar(procesos, { socios: caps.socios, bloqueados: caps.bloqueados });
  const enApp = await procesosPorCodigo(ctx, oportunidades.map((o) => o.codigo));
  const ahora = new Date();

  return NextResponse.json(
    {
      generado: ahora.toISOString(),
      agenda: armarAgenda(oportunidades, enApp, ahora),
      avisos: frescura.avisos,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
