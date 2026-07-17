// POST /api/plantillas/{id}/vista-previa — aplica las asignaciones del
// editor y rellena con datos de ejemplo: el usuario VE lo que va a salir.
// Con Gotenberg configurado devuelve PDF (previsualizable inline); sin él,
// el .docx para descargar.

import { NextResponse } from "next/server";
import { getMiembro } from "@/lib/auth";
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { aplicarAsignaciones } from "@/lib/licitaciones/plantillas";
import { rellenarPlantilla } from "@/lib/licitaciones/generador";
import { docxAPdf, pdfDisponible } from "@/lib/licitaciones/pdf";
import { datosEjemplo, type Asignacion } from "@/lib/licitaciones/variables";
import { obtenerPlantilla } from "@/lib/licitaciones/queries-plantillas";

export const runtime = "nodejs";
export const maxDuration = 60;

// Una "firma" de muestra visible para la vista previa.
const PNG_MUESTRA = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAYAAAD/Rn+7AAAAG0lEQVR42mP8z8Dwn4EIwDiqcFThqMJRhcQAAK2eNSHUS13tAAAAAElFTkSuQmCC",
  "base64",
);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isDemo()) return NextResponse.json({ error: "No disponible en demo." }, { status: 403 });
  const miembro = await getMiembro();
  if (!miembro) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { id } = await params;
  const plantilla = await obtenerPlantilla(id);
  if (!plantilla) return NextResponse.json({ error: "No encontrada." }, { status: 404 });

  const { asignaciones } = (await req.json()) as { asignaciones: Asignacion[] };

  const supabase = await createClient();
  const { data: archivo } = await supabase.storage
    .from("documentos")
    .download(plantilla.archivo_original);
  if (!archivo) return NextResponse.json({ error: "No se pudo leer el archivo." }, { status: 500 });

  try {
    const personalizadas = plantilla.variables_personalizadas ?? [];
    const taggeado = aplicarAsignaciones(
      Buffer.from(await archivo.arrayBuffer()),
      asignaciones ?? [],
      personalizadas.map((v) => v.clave),
    );
    const datosPersonalizados = Object.fromEntries(
      personalizadas.map((v) => [v.clave, v.valor || `[${v.etiqueta}]`]),
    );
    const relleno = rellenarPlantilla(taggeado, { ...datosEjemplo(), ...datosPersonalizados }, {
      firma: PNG_MUESTRA,
      sello: PNG_MUESTRA,
      logo: PNG_MUESTRA,
    });

    if (pdfDisponible()) {
      const pdf = await docxAPdf("vista-previa.docx", relleno);
      return new NextResponse(new Uint8Array(pdf), {
        headers: { "Content-Type": "application/pdf" },
      });
    }
    return new NextResponse(new Uint8Array(relleno), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="vista-previa.docx"',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo generar la vista previa." },
      { status: 422 },
    );
  }
}
