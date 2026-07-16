// GET /api/plantillas/{id}/analizar — párrafos + huecos detectados del .docx
// original: el insumo del editor de arrastrar variables.

import { NextResponse } from "next/server";
import { getMiembro } from "@/lib/auth";
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { analizarDocx } from "@/lib/licitaciones/plantillas";
import { obtenerPlantilla } from "@/lib/licitaciones/queries-plantillas";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isDemo()) return NextResponse.json({ error: "No disponible en demo." }, { status: 403 });
  const miembro = await getMiembro();
  if (!miembro) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { id } = await params;
  const plantilla = await obtenerPlantilla(id);
  if (!plantilla) return NextResponse.json({ error: "No encontrada." }, { status: 404 });

  const supabase = await createClient();
  const { data: archivo } = await supabase.storage
    .from("documentos")
    .download(plantilla.archivo_original);
  if (!archivo) return NextResponse.json({ error: "No se pudo leer el archivo." }, { status: 500 });

  try {
    const analisis = analizarDocx(Buffer.from(await archivo.arrayBuffer()));
    return NextResponse.json(analisis);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo analizar." },
      { status: 422 },
    );
  }
}
