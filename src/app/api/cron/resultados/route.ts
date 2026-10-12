// CRON — Resultados de los procesos en que participamos, POR ORGANIZACIÓN.
//
// Para cada empresa con RPE en su perfil:
//   1. busca en la API de la DGCP todas sus ofertas (filtro por RPE);
//   2. para cada proceso sin resultado final, calcula el resultado con la
//      API (lic_resultado): ganado, parcial, perdido, desierto, cancelado;
//   3. si el proceso está en adjudicado.app y seguía abierto (sometido,
//      subsanación…), pasa a «adjudicado» o «perdido» y lo anota;
//   4. a lo reciente (60 días) le prepara el expediente y el análisis
//      profundo (por qué), pocos por día: cuesta tiempo y OCR.
// Lo nuevo queda con visto = false: estadisticas_licitaciones lo muestra.
//
// Programado en vercel.json; Vercel manda `Authorization: Bearer CRON_SECRET`.

import { NextResponse, type NextRequest } from "next/server";
import * as dgcp from "@/lib/dgcp/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerFila } from "@/lib/expedientes/almacen";
import { encolarExpediente } from "@/lib/expedientes/cola";
import { actualizarLigero, analisisVigente, analizarNuestra, type Nosotros } from "@/lib/expedientes/resultados";

export const runtime = "nodejs";
export const maxDuration = 300;

const PRESUPUESTO_MS = 250_000;
const CONSULTAS_POR_ORG = 40;
const PROFUNDOS_POR_DIA = 3;
const DIAS_PROFUNDO = 60;

const ABIERTOS = ["armado", "listo", "sometido", "subsanacion"];

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const fin = Date.now() + PRESUPUESTO_MS;
  const sb = createAdminClient();
  const { data: perfiles, error } = await sb.from("empresa_perfil").select("org_id, nombre_legal, rpe").not("rpe", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const resumen: Record<string, unknown>[] = [];
  for (const p of perfiles ?? []) {
    if (Date.now() > fin) break;
    const nosotros: Nosotros = { rpe: String(p.rpe), razon_social: p.nombre_legal };
    const r = { org_id: p.org_id, consultados: 0, nuevos: 0, procesos_actualizados: 0, profundos: 0, errores: [] as string[] };
    try {
      const ofertas = await dgcp.listarOfertasDe(nosotros.rpe!);
      const { data: existentes } = await sb
        .from("lic_resultado")
        .select("codigo, resultado, detalle, analizado_at, fecha_oferta")
        .eq("org_id", p.org_id);
      const porCodigo = new Map((existentes ?? []).map((e) => [e.codigo as string, e]));

      // Sin resultado final, lo más reciente primero.
      const codigos = [...new Map(ofertas.map((o) => [o.codigo_proceso, o])).values()]
        .sort((a, b) => (b.fecha_entrega_oferta ?? "").localeCompare(a.fecha_entrega_oferta ?? ""))
        .map((o) => o.codigo_proceso)
        .filter((c) => (porCodigo.get(c)?.resultado ?? "pendiente") === "pendiente")
        .slice(0, CONSULTAS_POR_ORG);

      for (const codigo of codigos) {
        if (Date.now() > fin) break;
        r.consultados++;
        try {
          const { ligero, cambio } = await actualizarLigero(sb, p.org_id, codigo, nosotros);
          if (cambio) r.nuevos++;
          if (cambio && (ligero.resultado === "ganado" || ligero.resultado === "parcial" || ligero.resultado === "perdido")) {
            const estado = ligero.resultado === "perdido" ? "perdido" : "adjudicado";
            const { data: proc } = await sb
              .from("lic_proceso")
              .select("id, estado, notas")
              .eq("org_id", p.org_id)
              .eq("codigo", codigo)
              .maybeSingle();
            if (proc && ABIERTOS.includes(proc.estado)) {
              const nota = `- ${new Date().toISOString().slice(0, 10)}: resultado según la DGCP: ${ligero.resultado} (automático). Pide el informe: «por qué ${ligero.resultado === "perdido" ? "perdimos" : "ganamos"} ${codigo}».`;
              await sb
                .from("lic_proceso")
                .update({ estado, notas: proc.notas ? `${proc.notas}\n${nota}` : nota })
                .eq("id", proc.id);
              r.procesos_actualizados++;
            }
          }
        } catch (e) {
          r.errores.push(`${codigo}: ${e instanceof Error ? e.message : e}`);
        }
      }

      // Profundo: lo reciente y ya decidido, sin análisis.
      const desde = new Date(Date.now() - DIAS_PROFUNDO * 86_400_000).toISOString();
      const { data: candidatos } = await sb
        .from("lic_resultado")
        .select("codigo, resultado, analizado_at")
        .eq("org_id", p.org_id)
        .in("resultado", ["ganado", "parcial", "perdido"])
        .is("analizado_at", null)
        .gte("fecha_oferta", desde)
        .order("fecha_oferta", { ascending: false })
        .limit(PROFUNDOS_POR_DIA);
      for (const c of candidatos ?? []) {
        if (Date.now() > fin - 60_000) break;
        const fila = await leerFila(sb, c.codigo);
        if (fila?.estado === "listo") {
          if (!analisisVigente(c, fila)) {
            const [ofs, cts] = await Promise.all([dgcp.listarOfertas(c.codigo), dgcp.listarContratos(c.codigo)]);
            await analizarNuestra(sb, p.org_id, fila, nosotros, ofs, cts);
            r.profundos++;
          }
        } else if (fila?.estado !== "procesando") {
          await encolarExpediente(c.codigo, req.nextUrl.origin).catch((e) => r.errores.push(String(e)));
        }
      }
    } catch (e) {
      r.errores.push(e instanceof Error ? e.message : String(e));
    }
    resumen.push(r);
  }
  return NextResponse.json({ ok: true, resumen });
}
