// GET /api/licitaciones/{id}/generar — arma el PAQUETE COMPLETO: todos los
// requisitos marcados del proceso, cada uno con su archivo — los formularios
// se generan aquí, los subidos y los de Configuración → Empresa se anexan —
// ordenados por sobre (A: credenciales, B: económica) con un índice. Lo que
// no tiene archivo (verificado en línea, pendiente) queda declarado en el
// índice, no desaparece en silencio.
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
  generarDesdeBuffer,
  generarDocumento,
  type DocGenerado,
  type ImagenesFirma,
} from "@/lib/licitaciones/generador";
import type { LicPlantilla } from "@/lib/licitaciones/queries-plantillas";
import PizZipLib from "pizzip";
import { docxAPdf, pdfDisponible } from "@/lib/licitaciones/pdf";
import type { ProcesoCanonico } from "@/lib/licitaciones/contrato";
import {
  grupoDeRequisito,
  requisitoEstandar,
} from "@/lib/licitaciones/requisitos-estandar";

// En qué sobre se presenta cada grupo del checklist. Lo manual/desconocido
// va al Sobre A (credenciales); solo la económica viaja en el B.
const SOBRE: Record<string, string> = {
  legal: "Sobre A",
  financiera: "Sobre A",
  tecnica: "Sobre A",
  economica: "Sobre B",
  otros: "Sobre A",
};

// Nombre apto para archivo dentro del ZIP.
function limpio(texto: string): string {
  return texto.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 70);
}

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

  // 2) EL GATE: ningún NO subsanable pendiente. Bloqueo duro. Lo que la
  //    propia generación produce no bloquea — incluidas las plantillas que
  //    la organización construyó (lic_plantilla en estado "lista").
  const [{ data: requisitos }, { data: plantillasOrg }] = await Promise.all([
    supabase
      .from("lic_requisito")
      .select("id, codigo, subsanable, estado, nombre, datos, storage_path, documento_empresa_id, orden_indice")
      .eq("proceso_id", id)
      .eq("org_id", miembro.org_id),
    supabase
      .from("lic_plantilla")
      .select("*")
      .eq("org_id", miembro.org_id)
      .eq("estado", "lista"),
  ]);
  const plantillaPorCodigo = new Map(
    ((plantillasOrg ?? []) as LicPlantilla[]).map((p) => [p.codigo, p]),
  );
  const esGenerable = (codigo: string) =>
    Boolean(GENERABLES[codigo] || plantillaPorCodigo.has(codigo));
  const criticos = (requisitos ?? []).filter(
    (q) => !q.subsanable && q.estado === "pendiente" && !esGenerable(q.codigo),
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

  // 3) Qué se genera: los requisitos con plantilla — del sistema o de la org.
  const codigos = (requisitos ?? [])
    .filter((q) => esGenerable(q.codigo))
    .map((q) => q.codigo);
  // Las variables "se pregunta al generar" deben estar completas.
  const datosFaltantes: string[] = [];
  for (const q of requisitos ?? []) {
    const plantilla = plantillaPorCodigo.get(q.codigo);
    if (!plantilla) continue;
    const datos = (q.datos ?? {}) as Record<string, string>;
    for (const v of plantilla.variables_personalizadas ?? []) {
      if (!v.valor && !datos[v.clave]?.trim()) {
        datosFaltantes.push(`${plantilla.nombre}: falta "${v.etiqueta}" — complétalo en el requisito (2 · Requisitos)`);
      }
    }
  }
  if (datosFaltantes.length > 0) {
    return NextResponse.json(
      { error: "Faltan datos de tus plantillas.", faltantes: datosFaltantes },
      { status: 422 },
    );
  }
  if (codigos.length === 0) {
    return NextResponse.json(
      { error: "Este proceso no tiene requisitos generables (F.033/034/042 o plantillas propias). Agrégalos con el checklist." },
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

  // 4b) ¿Este paquete ya existe? La huella cubre todo lo que cambia el
  //     resultado: el expediente (sin meta — la versión sube sola), los
  //     archivos anexados, los datos capturados, la firma/sello y el
  //     formato. Mismo contenido → se devuelve el ZIP ya generado en vez
  //     de regenerar (y con ?regenerar=1 se fuerza).
  const { meta: _meta, ...canonicoSinMeta } = canonico;
  void _meta;
  const huella = createHash("sha256")
    .update(
      JSON.stringify({
        formato,
        canonico: canonicoSinMeta,
        requisitos: (requisitos ?? [])
          .map((q) => ({
            codigo: q.codigo,
            datos: q.datos ?? {},
            adjunto: esGenerable(q.codigo)
              ? null
              : q.storage_path ?? q.documento_empresa_id ?? null,
          }))
          .sort((a, b) => a.codigo.localeCompare(b.codigo)),
        sellos: (docsImagen ?? []).map((d) => d.archivo_url),
      }),
    )
    .digest("hex");
  const regenerar = new URL(req.url).searchParams.get("regenerar") === "1";
  if (!regenerar) {
    const { data: previo } = await supabase
      .from("lic_paquete")
      .select("storage_path")
      .eq("proceso_id", id)
      .eq("org_id", miembro.org_id)
      .eq("payload_hash", huella)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previo?.storage_path) {
      const { data: zipPrevio } = await supabase.storage
        .from("documentos")
        .download(previo.storage_path);
      if (zipPrevio) {
        const nombre = previo.storage_path.split("/").pop() ?? "paquete.zip";
        return new NextResponse(new Uint8Array(await zipPrevio.arrayBuffer()), {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${nombre}"`,
            "X-Paquete-Reusado": "1",
          },
        });
      }
    }
  }

  // 5) Generar (sistema + plantillas de la org).
  const documentos: DocGenerado[] = [];
  for (const codigo of codigos) {
    if (GENERABLES[codigo]) {
      documentos.push(generarDocumento(codigo, canonico, imagenes));
      continue;
    }
    const plantilla = plantillaPorCodigo.get(codigo)!;
    const { data: tpl } = await supabase.storage
      .from("documentos")
      .download(plantilla.archivo_tpl ?? plantilla.archivo_original);
    if (!tpl) {
      return NextResponse.json(
        { error: `No se pudo leer la plantilla ${plantilla.nombre} (${codigo}).` },
        { status: 500 },
      );
    }
    // Datos: los del expediente + valores fijos de la plantilla + los
    // capturados en el requisito de ESTE proceso.
    const requisito = (requisitos ?? []).find((q) => q.codigo === codigo);
    const fijos = Object.fromEntries(
      (plantilla.variables_personalizadas ?? [])
        .filter((v) => v.valor)
        .map((v) => [v.clave, v.valor]),
    );
    const capturados = (requisito?.datos ?? {}) as Record<string, string>;
    documentos.push(
      generarDesdeBuffer(
        codigo,
        plantilla.nombre,
        Buffer.from(await tpl.arrayBuffer()),
        canonico,
        imagenes,
        { ...fijos, ...capturados },
      ),
    );
  }
  // 6) Los generados, convertidos si se pidió PDF (estos también se suben
  //    sueltos a storage y dejan su requisito en "listo").
  let archivos = documentos.map((d) => ({
    ...d,
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }));
  if (formato === "pdf") {
    archivos = await Promise.all(
      archivos.map(async (d) => ({
        ...d,
        archivo: d.archivo.replace(/\.docx$/, ".pdf"),
        buffer: await docxAPdf(d.archivo, d.buffer),
        contentType: "application/pdf",
      })),
    );
  }

  // 7) EL EXPEDIENTE COMPLETO: cada requisito marcado, en orden de sobre,
  //    con su archivo — generado, subido al requisito, o el documento de
  //    Empresa enlazado. Lo que no tiene archivo se declara en el índice.
  const generadoPorCodigo = new Map(archivos.map((d) => [d.codigo, d]));

  const idsDocEmpresa = (requisitos ?? [])
    .map((q) => q.documento_empresa_id)
    .filter(Boolean) as string[];
  const docEmpresaPorId = new Map<string, { archivo_url: string }>();
  if (idsDocEmpresa.length > 0) {
    const { data } = await supabase
      .from("documento_empresa")
      .select("id, archivo_url")
      .in("id", idsDocEmpresa);
    for (const d of data ?? []) docEmpresaPorId.set(d.id, d);
  }

  const ordenados = [...(requisitos ?? [])].sort((a, b) => {
    const sa = SOBRE[grupoDeRequisito(a.codigo)] ?? "Sobre A";
    const sb = SOBRE[grupoDeRequisito(b.codigo)] ?? "Sobre A";
    if (sa !== sb) return sa < sb ? -1 : 1;
    return (a.orden_indice ?? 0) - (b.orden_indice ?? 0);
  });

  const zip = new PizZipLib();
  const indice: string[] = [
    `Expediente ${canonico.proceso.codigo} — versión ${canonico.meta.version}`,
    `Oferente: ${canonico.oferente.razon_social} (RNC ${canonico.oferente.rnc})`,
    "",
  ];
  const sinArchivo: string[] = [];
  let n = 0;
  let sobreAnterior = "";
  for (const q of ordenados) {
    const sobre = SOBRE[grupoDeRequisito(q.codigo)] ?? "Sobre A";
    const gen = generadoPorCodigo.get(q.codigo);

    // De dónde sale el archivo de este requisito.
    let buffer: Buffer | null = null;
    let ext = "";
    let origenNota = "";
    if (gen) {
      buffer = gen.buffer;
      ext = formato === "pdf" ? ".pdf" : ".docx";
      origenNota = "generado";
    } else {
      const ruta =
        q.storage_path ??
        (q.documento_empresa_id
          ? docEmpresaPorId.get(q.documento_empresa_id)?.archivo_url ?? null
          : null);
      if (ruta) {
        const { data: adj } = await supabase.storage.from("documentos").download(ruta);
        if (adj) {
          buffer = Buffer.from(await adj.arrayBuffer());
          ext = ruta.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase() ?? "";
          origenNota = q.storage_path ? "subido" : "de Empresa";
          // En el paquete PDF, los adjuntos Word también se convierten;
          // el resto (pdf, imágenes) viaja tal cual.
          if (formato === "pdf" && (ext === ".docx" || ext === ".doc")) {
            buffer = await docxAPdf(`adj${ext}`, buffer);
            ext = ".pdf";
          }
        }
      }
    }

    if (sobre !== sobreAnterior) {
      indice.push(`${sobre}`);
      sobreAnterior = sobre;
    }
    if (buffer) {
      n += 1;
      const nn = String(n).padStart(2, "0");
      const entrada = `${sobre}/${nn} ${limpio(q.codigo)} — ${limpio(q.nombre)}${ext}`;
      zip.file(entrada, buffer);
      indice.push(`  ${nn} ${q.codigo} — ${q.nombre} (${origenNota})`);
    } else if (requisitoEstandar(q.codigo)?.via === "linea") {
      indice.push(`  ·· ${q.codigo} — ${q.nombre}: la entidad lo verifica en línea, no lleva archivo`);
    } else {
      indice.push(`  ¡FALTA! ${q.codigo} — ${q.nombre}: sin archivo`);
      sinArchivo.push(`${q.codigo} — ${q.nombre}`);
    }
  }
  if (sinArchivo.length > 0) {
    indice.push("", "Pendientes de completar antes de presentar:", ...sinArchivo.map((s) => `  - ${s}`));
  }
  zip.file("00 INDICE.txt", indice.join("\n") + "\n");

  const zipFinal: Buffer = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
  let zipNombre = `paquete_${canonico.proceso.codigo.replace(/[^\w-]+/g, "-")}_v${canonico.meta.version}.zip`;
  if (formato === "pdf") zipNombre = zipNombre.replace(/\.zip$/, "_pdf.zip");
  const user = await getUser();

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
    payload_hash: huella,
    storage_path: `${base}/${zipNombre}`,
    generado_por: user?.id ?? null,
  });

  // 8) El ZIP baja directo al navegador.
  return new NextResponse(new Uint8Array(zipFinal), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipNombre}"`,
    },
  });
}
