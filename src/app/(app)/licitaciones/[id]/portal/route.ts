// GET /licitaciones/{id}/portal — abre la ficha del proceso en
// ComprasDominicana (redirección). Es el destino del botón «Portal» de la
// Bid Room: un enlace estable aunque el proceso no tenga el noticeUID
// guardado; si hay que buscarlo, se deja anotado para la próxima vez.

import { NextResponse } from "next/server";
import { getMiembro } from "@/lib/auth";
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { obtenerProceso } from "@/lib/licitaciones/queries";
import { conNotaPortal, fichaEnNotas, resolverFicha } from "@/lib/licitaciones/portal-enlace";
import { PORTAL } from "@/lib/dgcp/portal-busqueda";

export const runtime = "nodejs";
// El buscador del portal abre sesión y pagina: puede tardar unos segundos.
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const miembro = await getMiembro();
  if (!miembro) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const { id } = await params;
  const detalle = await obtenerProceso(id);
  if (!detalle) return NextResponse.json({ error: "Proceso no encontrado." }, { status: 404 });
  const { proceso } = detalle;

  const guardada = fichaEnNotas(proceso.notas);
  if (guardada) return NextResponse.redirect(guardada);

  const ficha = await resolverFicha(proceso.codigo);
  // Sin ficha (código mal escrito, o el portal y la API caídos): al menos
  // el portal, mejor que un error.
  if (!ficha) return NextResponse.redirect(PORTAL);

  if (!isDemo()) {
    const supabase = await createClient();
    await supabase
      .from("lic_proceso")
      .update({ notas: conNotaPortal(proceso.notas, ficha) })
      .eq("id", id)
      .eq("org_id", miembro.org_id);
  }
  return NextResponse.redirect(ficha);
}
