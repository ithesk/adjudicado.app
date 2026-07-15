// GET /api/licitaciones/{id}/canonico — el JSON canónico del proceso,
// validado contra el contrato (Fase 1). Es lo que consumirá el motor
// documental (Fase 4). Si el expediente está incompleto devuelve 422 con la
// lista legible de qué falta.

import { NextResponse } from "next/server";
import { getMiembro } from "@/lib/auth";
import { isDemo } from "@/lib/demo";
import { construirCanonico } from "@/lib/licitaciones/queries";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isDemo()) {
    return NextResponse.json({ error: "No disponible en modo demo." }, { status: 403 });
  }
  const miembro = await getMiembro();
  if (!miembro) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const { id } = await params;
  const r = await construirCanonico(id);
  if (r.errores) {
    return NextResponse.json(
      { valido: false, errores: r.errores },
      { status: r.errores[0] === "Proceso no encontrado." ? 404 : 422 },
    );
  }
  return NextResponse.json({ valido: true, proceso: r.canonico });
}
