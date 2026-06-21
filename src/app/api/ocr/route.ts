import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getMiembro } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { extraerOrdenDeCompra } from "@/lib/ocr";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const miembro = await getMiembro();
  if (!miembro) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const form = await req.formData();
  const archivo = form.get("archivo");
  if (!(archivo instanceof File) || archivo.type !== "application/pdf") {
    return NextResponse.json(
      { error: "Sube un archivo PDF de la orden de compra." },
      { status: 400 },
    );
  }
  if (archivo.size > 15 * 1024 * 1024) {
    return NextResponse.json(
      { error: "El PDF supera 15 MB." },
      { status: 400 },
    );
  }

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const base64 = Buffer.from(bytes).toString("base64");

  // Sube el PDF a Storage bajo {org_id}/inbox/...
  const supabase = await createClient();
  const path = `${miembro.org_id}/inbox/${randomUUID()}.pdf`;
  const { error: upErr } = await supabase.storage
    .from("ordenes-oc")
    .upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (upErr) {
    return NextResponse.json(
      { error: "No se pudo guardar el PDF: " + upErr.message },
      { status: 500 },
    );
  }

  // Extrae datos con Claude.
  try {
    const { resultado, crudo } = await extraerOrdenDeCompra(base64);
    return NextResponse.json({ ocr: resultado, crudo, archivo_path: path });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    // El PDF ya quedó guardado; devolvemos el path para crear igual a mano.
    return NextResponse.json(
      { error: "El OCR falló: " + msg, archivo_path: path },
      { status: 502 },
    );
  }
}
