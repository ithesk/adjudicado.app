// Prepara el expediente completo de un proceso en segundo plano (ver
// src/lib/expedientes/preparar.ts). Solo llamadas internas: el MCP y el cron
// mandan `Authorization: Bearer <secretoInterno()>`.
//
// Responde 202 al instante y trabaja en after() hasta ~280 s; si queda
// trabajo (OCR largo, análisis), se vuelve a llamar a sí misma. La reserva
// (trabajando_hasta) evita que dos llamadas procesen el mismo expediente.

import { after, NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { liberar, reservar } from "@/lib/expedientes/almacen";
import { encolarExpediente, secretoInterno } from "@/lib/expedientes/cola";
import { prepararExpediente } from "@/lib/expedientes/preparar";

export const runtime = "nodejs";
export const maxDuration = 300;

const PRESUPUESTO_MS = 280_000;

export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${secretoInterno()}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const { codigo } = (await req.json().catch(() => ({}))) as { codigo?: string };
  if (!codigo || codigo.length < 5) return NextResponse.json({ error: "Falta el código del proceso." }, { status: 400 });

  const sb = createAdminClient();
  const inicio = Date.now();
  if (!(await reservar(sb, codigo, new Date(inicio + PRESUPUESTO_MS + 15_000)))) {
    return NextResponse.json({ codigo, aviso: "Ya se está preparando." }, { status: 409 });
  }

  const origen = req.nextUrl.origin;
  after(async () => {
    let seguir = false;
    try {
      const r = await prepararExpediente(sb, codigo, inicio + PRESUPUESTO_MS);
      seguir = !r.terminado;
    } finally {
      await liberar(sb, codigo);
    }
    if (seguir) await encolarExpediente(codigo, origen).catch(() => undefined);
  });
  return NextResponse.json({ codigo, encolado: true }, { status: 202 });
}
