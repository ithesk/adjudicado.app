// GET /api/licitaciones/{id}/generar — genera el paquete: los formularios
// oficiales rellenados con el expediente validado, devueltos como ZIP.
//
// EL GATE (Fase 5) vive aquí y es BLOQUEO DURO: con requisitos NO subsanables
// pendientes el paquete no sale (409) — no es un warning, es la razón de ser
// del módulo. El expediente incompleto tampoco (422, con la lista legible).
//
// Cada generación queda registrada en lic_paquete con el payload exacto y su
// hash (idempotencia: mismo expediente → mismo paquete), el ZIP se guarda en
// storage, y los requisitos generados quedan con su archivo y en "listo".

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getMiembro, getUser } from "@/lib/auth";
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { construirCanonico } from "@/lib/licitaciones/queries";
import { GENERABLES, generarPaquete } from "@/lib/licitaciones/generador";
import type { ProcesoCanonico } from "@/lib/licitaciones/contrato";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  const supabase = await createClient();

  // 1) El expediente debe estar completo (el contrato canónico valida).
  const r = await construirCanonico(id);
  if (r.errores) {
    return NextResponse.json(
      { error: "El expediente está incompleto.", faltantes: r.errores },
      { status: r.errores[0] === "Proceso no encontrado." ? 404 : 422 },
    );
  }
  const canonico = r.canonico as ProcesoCanonico;

  // 2) EL GATE: ningún NO subsanable pendiente. Bloqueo duro.
  const { data: requisitos } = await supabase
    .from("lic_requisito")
    .select("id, codigo, subsanable, estado, nombre")
    .eq("proceso_id", id)
    .eq("org_id", miembro.org_id);
  const criticos = (requisitos ?? []).filter(
    (q) => !q.subsanable && q.estado === "pendiente" && !GENERABLES[q.codigo],
  );
  if (criticos.length > 0) {
    return NextResponse.json(
      {
        error: "Hay requisitos NO subsanables pendientes — el paquete no puede salir así.",
        criticos: criticos.map((c) => `${c.codigo} — ${c.nombre}`),
      },
      { status: 409 },
    );
  }

  // 3) Qué se genera: los requisitos del proceso que tienen plantilla.
  const codigos = (requisitos ?? [])
    .filter((q) => GENERABLES[q.codigo])
    .map((q) => q.codigo);
  if (codigos.length === 0) {
    return NextResponse.json(
      { error: "Este proceso no tiene requisitos generables (F.033/034/042). Agrégalos con el checklist." },
      { status: 422 },
    );
  }

  // 4) Generar y registrar.
  const paquete = generarPaquete(codigos, canonico);
  const user = await getUser();
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(canonico))
    .digest("hex");

  const base = `${miembro.org_id}/licitaciones/${id}/v${canonico.meta.version}`;
  await supabase.storage
    .from("documentos")
    .upload(`${base}/${paquete.zipNombre}`, paquete.zip, {
      contentType: "application/zip",
      upsert: true,
    });

  for (const doc of paquete.documentos) {
    const rutaDoc = `${base}/${doc.archivo}`;
    const { error: errSubida } = await supabase.storage
      .from("documentos")
      .upload(rutaDoc, doc.buffer, {
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
    if (!errSubida) {
      // El requisito generado queda con su archivo, listo y auditado.
      await supabase
        .from("lic_requisito")
        .update({ storage_path: rutaDoc, estado: "listo", origen: "generado" })
        .eq("proceso_id", id)
        .eq("org_id", miembro.org_id)
        .eq("codigo", doc.codigo);
    }
  }

  await supabase.from("lic_paquete").insert({
    org_id: miembro.org_id,
    proceso_id: id,
    version: canonico.meta.version,
    payload: canonico,
    payload_hash: payloadHash,
    storage_path: `${base}/${paquete.zipNombre}`,
    generado_por: user?.id ?? null,
  });

  // 5) El ZIP baja directo al navegador.
  return new NextResponse(new Uint8Array(paquete.zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${paquete.zipNombre}"`,
    },
  });
}
