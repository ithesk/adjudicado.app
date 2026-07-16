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
import {
  GENERABLES,
  generarPaquete,
  type ImagenesFirma,
} from "@/lib/licitaciones/generador";
import { docxAPdf, pdfDisponible } from "@/lib/licitaciones/pdf";
import PizZip from "pizzip";
import type { ProcesoCanonico } from "@/lib/licitaciones/contrato";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const formato = new URL(req.url).searchParams.get("formato") ?? "docx";
  if (formato === "pdf" && !pdfDisponible()) {
    return NextResponse.json(
      { error: "El convertidor PDF no está configurado todavía (ver infra/gotenberg)." },
      { status: 501 },
    );
  }
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

  // 4) La firma y el sello (imágenes de Configuración → Empresa, si existen).
  const imagenes: ImagenesFirma = {};
  const { data: docsImagen } = await supabase
    .from("documento_empresa")
    .select("tipo, archivo_url, created_at")
    .eq("org_id", miembro.org_id)
    .in("tipo", ["firma", "sello"])
    .order("created_at", { ascending: false });
  for (const tipo of ["firma", "sello"] as const) {
    const doc = (docsImagen ?? []).find((d) => d.tipo === tipo);
    if (!doc) continue;
    const { data: archivo } = await supabase.storage
      .from("documentos")
      .download(doc.archivo_url);
    if (archivo) imagenes[tipo] = Buffer.from(await archivo.arrayBuffer());
  }

  // 5) Generar (y convertir a PDF si se pidió) y registrar.
  const paquete = generarPaquete(codigos, canonico, imagenes);
  let archivos = paquete.documentos.map((d) => ({
    ...d,
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }));
  let zipFinal = paquete.zip;
  let zipNombre = paquete.zipNombre;
  if (formato === "pdf") {
    archivos = await Promise.all(
      archivos.map(async (d) => ({
        ...d,
        archivo: d.archivo.replace(/\.docx$/, ".pdf"),
        buffer: await docxAPdf(d.archivo, d.buffer),
        contentType: "application/pdf",
      })),
    );
    const zipPdf = new PizZip();
    for (const d of archivos) zipPdf.file(d.archivo, d.buffer);
    zipFinal = zipPdf.generate({ type: "nodebuffer", compression: "DEFLATE" });
    zipNombre = paquete.zipNombre.replace(/\.zip$/, "_pdf.zip");
  }
  const user = await getUser();
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(canonico))
    .digest("hex");

  const base = `${miembro.org_id}/licitaciones/${id}/v${canonico.meta.version}`;
  await supabase.storage
    .from("documentos")
    .upload(`${base}/${zipNombre}`, zipFinal, {
      contentType: "application/zip",
      upsert: true,
    });

  for (const doc of archivos) {
    const rutaDoc = `${base}/${doc.archivo}`;
    const { error: errSubida } = await supabase.storage
      .from("documentos")
      .upload(rutaDoc, doc.buffer, {
        contentType: doc.contentType,
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
    storage_path: `${base}/${zipNombre}`,
    generado_por: user?.id ?? null,
  });

  // 5) El ZIP baja directo al navegador.
  return new NextResponse(new Uint8Array(zipFinal), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipNombre}"`,
    },
  });
}
