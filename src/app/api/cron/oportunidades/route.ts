// CRON — Barrido de oportunidades (API ∪ portal), POR ORGANIZACIÓN, y
// vigilancia de las dos fuentes de la DGCP.
//
// Lo que hace en cada pasada (la idea: dos al día, 8:30 y 18:30 de RD, al
// poco de que la DGCP publique sus tandas de la mañana y de la tarde):
//   1. lista todo lo abierto con fuentes.listarAbiertos (datos abiertos +
//      lo recién publicado en el portal, que a la API le llega horas después);
//   2. para cada empresa, pasa el radar con SUS socios y guarda en
//      lic_oportunidad lo de nivel alta/media que cierra en ≤ 21 días. La
//      bandeja lo muestra: «qué hay hoy» ya no depende de que la API
//      conteste en ese instante;
//   3. anota en dgcp_fuente_salud cómo están las fuentes (hasta cuándo llega
//      cada una, retraso, errores). La bandeja avisa si la API lleva más de
//      un día sin actualizarse o el portal dejó de leerse.
//
// Autorización: `Authorization: Bearer CRON_SECRET`, como los otros crons.
// NO está en vercel.json: el plan Hobby admite dos crons diarios y ya los
// ocupan odoo-facturas y resultados. Se dispara desde fuera con el mismo
// secreto (un cron del taller, Home Assistant…):
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/oportunidades

import { NextResponse, type NextRequest } from "next/server";
import { listarAbiertos } from "@/lib/dgcp/fuentes";
import { radar } from "@/lib/dgcp/relevancia";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

// Más allá de esto no es «trabajo de hoy»: la bandeja no es el buscador.
const DIAS_MAX = 21;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const sb = createAdminClient();
  const ahora = new Date();

  let listado: Awaited<ReturnType<typeof listarAbiertos>>;
  try {
    listado = await listarAbiertos({ ahora });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await sb.from("dgcp_fuente_salud").insert({
      api_ok: false,
      portal_ok: false,
      api_error: error,
      portal_error: error,
      avisos: [error],
    });
    return NextResponse.json({ ok: false, error }, { status: 503 });
  }
  const { procesos, origen, frescura } = listado;
  const publicadoPor = new Map(procesos.map((p) => [p.codigo_proceso, p.fecha_publicacion]));

  // Salud primero: aunque fallen las empresas, el dato de las fuentes queda.
  await sb.from("dgcp_fuente_salud").insert({
    api_ok: frescura.api.ok,
    api_hasta: frescura.api.hasta,
    api_procesos: frescura.api.procesos,
    api_error: frescura.api.error ?? null,
    portal_ok: frescura.portal.ok,
    portal_hasta: frescura.portal.hasta,
    portal_procesos: frescura.portal.procesos,
    portal_error: frescura.portal.error ?? null,
    retraso_horas: frescura.api.retraso_horas ?? null,
    nuevos_del_portal: frescura.nuevos_del_portal,
    avisos: frescura.avisos,
  });

  const { data: perfiles, error } = await sb.from("empresa_perfil").select("org_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: caps } = await sb.from("lic_capability").select("org_id, vendor, estado");

  const resumen: Record<string, unknown>[] = [];
  for (const p of perfiles ?? []) {
    const r = { org_id: p.org_id, detectadas: 0, nuevas: 0, errores: [] as string[] };
    try {
      const mias = (caps ?? []).filter((c) => c.org_id === p.org_id);
      const ops = radar(procesos, {
        socios: mias.filter((c) => c.estado === "partner" || c.estado === "canal").map((c) => c.vendor),
        bloqueados: mias.filter((c) => c.estado === "blocker").map((c) => c.vendor),
        ahora,
      }).filter((o) => o.nivel !== "explorar" && o.dias_restantes !== null && o.dias_restantes <= DIAS_MAX);
      r.detectadas = ops.length;
      if (ops.length === 0) {
        resumen.push(r);
        continue;
      }
      const { data: previas } = await sb
        .from("lic_oportunidad")
        .select("codigo")
        .eq("org_id", p.org_id)
        .in(
          "codigo",
          ops.map((o) => o.codigo),
        );
      const conocidas = new Set((previas ?? []).map((x) => x.codigo as string));
      r.nuevas = ops.filter((o) => !conocidas.has(o.codigo)).length;
      const { error: eUp } = await sb.from("lic_oportunidad").upsert(
        ops.map((o) => ({
          org_id: p.org_id,
          codigo: o.codigo,
          titulo: o.titulo,
          institucion: o.institucion,
          modalidad: o.modalidad,
          monto: o.monto,
          divisa: o.divisa,
          cierre: o.cierre,
          publicado: publicadoPor.get(o.codigo) ?? null,
          nivel: o.nivel,
          puntaje: o.puntaje,
          socios: o.socios,
          coincidencias: o.coincidencias,
          origen: origen.get(o.codigo) ?? "api",
          url: o.url,
          actualizado_at: ahora.toISOString(),
        })),
        { onConflict: "org_id,codigo" },
      );
      if (eUp) r.errores.push(eUp.message);
    } catch (e) {
      r.errores.push(e instanceof Error ? e.message : String(e));
    }
    resumen.push(r);
  }

  return NextResponse.json({
    ok: true,
    escaneados: procesos.length,
    frescura,
    resumen,
  });
}
