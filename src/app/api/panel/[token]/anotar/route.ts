// El Kindle anota en un proceso: POST /api/panel/<clave de anotar>/anotar.
//
//   { "tipo": "nota",   "codigo": "X-CM-2026-0001", "texto": "Falta firma", "cuando": "<ISO>" }
//   { "tipo": "bloque", "codigo": "X-CM-2026-0001", "minutos": 50, "inicio": "<ISO>" }
//
// Solo toca lic_proceso.notas (ver src/lib/panel/notas.ts). La clave es la
// pna_, no la de lectura (src/lib/panel/clave.ts). Los reintentos de la cola
// del Kindle no duplican nada.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverClaveAnotar } from "@/lib/panel/clave";
import { agregarNota, LIMITE_NOTA, lineaNota, sumarBloque } from "@/lib/panel/notas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Fecha = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Fecha no válida");
const Cuerpo = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("nota"),
    codigo: z.string().min(3).max(80),
    texto: z.string().min(1).max(LIMITE_NOTA * 2),
    cuando: Fecha.optional(),
  }),
  z.object({
    tipo: z.literal("bloque"),
    codigo: z.string().min(3).max(80),
    minutos: z.number().int().min(1).max(600),
    inicio: Fecha,
  }),
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const conexion = await resolverClaveAnotar(token);
  if (!conexion) return NextResponse.json({ error: "Clave no válida o revocada." }, { status: 401 });

  const leido = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!leido.success) return NextResponse.json({ error: "Petición no válida." }, { status: 400 });
  const a = leido.data;

  const supabase = createAdminClient();
  const { data: proc, error } = await supabase
    .from("lic_proceso")
    .select("id, notas")
    .eq("org_id", conexion.orgId)
    .eq("codigo", a.codigo)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // 404 es definitivo: el Kindle lo saca de la cola en vez de reintentar.
  if (!proc) return NextResponse.json({ error: "Ese proceso no está en adjudicado." }, { status: 404 });

  let notas: string;
  let cambio: boolean;
  if (a.tipo === "nota") {
    const linea = lineaNota(a.texto, a.cuando ? new Date(a.cuando) : new Date());
    if (!linea) return NextResponse.json({ error: "Nota vacía." }, { status: 400 });
    notas = agregarNota(proc.notas, linea);
    cambio = notas !== (proc.notas ?? "").replace(/\s+$/, "");
  } else {
    ({ notas, sumado: cambio } = sumarBloque(proc.notas, a.minutos, new Date(a.inicio)));
  }

  if (cambio) {
    const { error: e } = await supabase
      .from("lic_proceso")
      .update({ notas })
      .eq("org_id", conexion.orgId)
      .eq("id", proc.id);
    if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, cambio }, { headers: { "Cache-Control": "no-store" } });
}
