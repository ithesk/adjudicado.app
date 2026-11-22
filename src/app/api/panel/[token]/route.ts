// Panel de solo lectura: GET /api/panel/<clave> → JSON compacto con los
// procesos en preparación, su fecha límite y el avance del expediente.
// Lo consulta el Kindle del taller cada minuto (plugin de KOReader).
// La clave se explica en src/lib/panel/clave.ts.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { coberturaPorTipo, estaCubierto } from "@/lib/licitaciones/cobertura-empresa";
import type { DocumentoEmpresa } from "@/lib/empresa/documentos";
import { resolverClavePanel } from "@/lib/panel/clave";
import { ESTADOS_EN_PREPARACION, resumirProcesos, type FilaProceso } from "@/lib/panel/resumen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const conexion = await resolverClavePanel(token);
  if (!conexion) return NextResponse.json({ error: "Clave no válida o revocada." }, { status: 401 });

  const supabase = createAdminClient();
  const { orgId } = conexion;

  const { data: procesos, error } = await supabase
    .from("lic_proceso")
    .select("id, codigo, objeto, estado, cierre, institucion(nombre, siglas)")
    .eq("org_id", orgId)
    .in("estado", [...ESTADOS_EN_PREPARACION])
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (procesos ?? []).map((p) => p.id);
  const [requisitos, items, subsanaciones, docs] = await Promise.all([
    ids.length
      ? supabase.from("lic_requisito").select("proceso_id, codigo, nombre, estado").eq("org_id", orgId).in("proceso_id", ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase.from("lic_item").select("proceso_id, ofertamos, precio_unitario").eq("org_id", orgId).in("proceso_id", ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase.from("lic_subsanacion").select("proceso_id, fecha_limite").in("proceso_id", ids).neq("estado", "cerrada")
      : Promise.resolve({ data: [] }),
    supabase.from("documento_empresa").select("*").eq("org_id", orgId),
  ]);

  const cobertura = coberturaPorTipo((docs.data ?? []) as DocumentoEmpresa[]);
  const resumen = resumirProcesos(
    (procesos ?? []) as unknown as FilaProceso[],
    (requisitos.data ?? []).map((r) => ({
      proceso_id: r.proceso_id,
      nombre: r.nombre,
      estado: r.estado,
      cubierto: estaCubierto(r.codigo, cobertura),
    })),
    (items.data ?? []).map((i) => ({
      proceso_id: i.proceso_id,
      ofertamos: i.ofertamos,
      cotizado: i.precio_unitario !== null,
    })),
    subsanaciones.data ?? [],
    new Date(),
  );

  return NextResponse.json(resumen, { headers: { "Cache-Control": "no-store" } });
}
