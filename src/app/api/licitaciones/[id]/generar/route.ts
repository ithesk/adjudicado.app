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
import { NextResponse, after } from "next/server";
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
import { resolverPlantillas } from "@/lib/licitaciones/plantillas";
import PizZipLib from "pizzip";
import { docxAPdf, pdfDisponible, unirPdfs } from "@/lib/licitaciones/pdf";
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

// Nombre apto para archivo dentro del ZIP: ASCII PURO — sin espacios, sin
// acentos, sin símbolos (los portales de las entidades rechazan subirlos).
// Solo letras, números, guion y guion bajo.
function limpio(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // acentos y diéresis fuera (ñ → n)
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const formato = new URL(req.url).searchParams.get("formato") ?? "docx";
  // Con ?solo=<código> se genera ÚNICAMENTE ese formulario y baja directo
  // (docx o pdf, sin ZIP): para reponer o revisar un documento suelto sin
  // armar el expediente. No pasa por el gate — un formulario no es el paquete.
  const solo = new URL(req.url).searchParams.get("solo");
  // Con ?subsanacion=<id> el paquete es CHICO: solo los requisitos que la
  // entidad pidió en esa subsanación, todos obligatorios, sin sobres.
  const subsanacionId = new URL(req.url).searchParams.get("subsanacion");
  // Con ?unir=1 (solo PDF): UN solo PDF por sobre — los portales piden subir
  // 2-3 archivos, no 15. Lo que no se pueda unir viaja suelto y declarado.
  const unir = formato === "pdf" && new URL(req.url).searchParams.get("unir") === "1";
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
  const [{ data: requisitos }, { data: plantillasOrg }, { data: proc }] = await Promise.all([
    supabase
      .from("lic_requisito")
      .select("id, codigo, subsanable, estado, nombre, datos, storage_path, documento_empresa_id, orden_indice, subsanacion_id")
      .eq("proceso_id", id)
      .eq("org_id", miembro.org_id),
    supabase
      .from("lic_plantilla")
      .select("*")
      .eq("org_id", miembro.org_id)
      .eq("estado", "lista"),
    supabase
      .from("lic_proceso")
      .select("institucion_id")
      .eq("id", id)
      .eq("org_id", miembro.org_id)
      .maybeSingle(),
  ]);
  // CASCADA por código: variante de la entidad del proceso → genérica de
  // la org → (más abajo) plantilla del sistema.
  const plantillaPorCodigo = resolverPlantillas(
    (plantillasOrg ?? []) as LicPlantilla[],
    proc?.institucion_id ?? null,
  );
  const esGenerable = (codigo: string) =>
    Boolean(GENERABLES[codigo] || plantillaPorCodigo.has(codigo));

  // ¿Paquete completo o de subsanación? La subsanación acota el universo a
  // lo pedido, y ahí TODO es obligatorio (no hay "subsanable después" —
  // esto ES el después).
  let subsanacion: { id: string; fecha_limite: string } | null = null;
  let enPaquete = requisitos ?? [];
  if (solo) {
    // Un solo formulario: debe estar en el checklist y ser generable.
    const requisito = enPaquete.find((q) => q.codigo === solo);
    if (!requisito) {
      return NextResponse.json(
        { error: `El requisito ${solo} no está en el checklist de este proceso.` },
        { status: 404 },
      );
    }
    if (!esGenerable(solo)) {
      return NextResponse.json(
        { error: `${solo} no se genera por el sistema — es un documento que se sube o se verifica.` },
        { status: 422 },
      );
    }
  } else if (subsanacionId) {
    const { data: s } = await supabase
      .from("lic_subsanacion")
      .select("id, fecha_limite")
      .eq("id", subsanacionId)
      .eq("proceso_id", id)
      .eq("org_id", miembro.org_id)
      .maybeSingle();
    if (!s) {
      return NextResponse.json({ error: "Subsanación no encontrada." }, { status: 404 });
    }
    subsanacion = s;
    enPaquete = enPaquete.filter((q) => q.subsanacion_id === subsanacionId);
    if (enPaquete.length === 0) {
      return NextResponse.json(
        { error: "Marca en 2 · Requisitos qué documentos pidió la subsanación." },
        { status: 422 },
      );
    }
    const incompletos = enPaquete.filter(
      (q) => q.estado === "pendiente" && !esGenerable(q.codigo),
    );
    if (incompletos.length > 0) {
      return NextResponse.json(
        {
          error: "La subsanación no puede salir incompleta — todo lo pedido es obligatorio.",
          criticos: incompletos.map((c) => `${c.codigo} — ${c.nombre}`),
        },
        { status: 409 },
      );
    }
  } else {
    const criticos = enPaquete.filter(
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
  }

  // 3) Qué se genera: los requisitos con plantilla — del sistema o de la
  //    org. Con ?solo, exactamente ese.
  const codigos = solo
    ? [solo]
    : enPaquete.filter((q) => esGenerable(q.codigo)).map((q) => q.codigo);
  // Las variables "se pregunta al generar" deben estar completas.
  const datosFaltantes: string[] = [];
  for (const q of solo ? enPaquete.filter((q) => q.codigo === solo) : enPaquete) {
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
  // El paquete completo sin nada que generar no tiene sentido; el de
  // subsanación sí puede ser puros adjuntos re-subidos.
  if (codigos.length === 0 && !subsanacion) {
    return NextResponse.json(
      { error: "Este proceso no tiene requisitos generables (F.033/034/042 o plantillas propias). Agrégalos con el checklist." },
      { status: 422 },
    );
  }

  // 4) Firma, sello y logo (imágenes de Configuración → Empresa, si existen),
  //    el logo de la INSTITUCIÓN contratante (lo pinta el F.040 en su
  //    cabecera) y los procesos ya adjudicados (el F.040 los declara).
  //    En PARALELO — cada viaje a storage cuesta segundos y aquí nada depende
  //    de nada (la lentitud en serie era la queja: 11 requisitos ≈ 2 minutos).
  const imagenes: ImagenesFirma = {};
  const [{ data: docsImagen }, { data: instLogo }, { data: adjudicadosPrevios }] =
    await Promise.all([
      supabase
        .from("documento_empresa")
        .select("tipo, archivo_url, created_at")
        .eq("org_id", miembro.org_id)
        .in("tipo", ["firma", "sello", "logo"])
        .order("created_at", { ascending: false }),
      proc?.institucion_id
        ? supabase
            .from("institucion")
            .select("logo_url")
            .eq("id", proc.institucion_id)
            .eq("org_id", miembro.org_id)
            .maybeSingle()
        : Promise.resolve({ data: null as { logo_url: string | null } | null }),
      supabase
        .from("lic_proceso")
        .select("codigo, objeto, updated_at, institucion:institucion_id(nombre)")
        .eq("org_id", miembro.org_id)
        .eq("estado", "adjudicado")
        .neq("id", id)
        .order("updated_at", { ascending: false })
        .limit(10),
    ]);
  await Promise.all([
    ...(["firma", "sello", "logo"] as const).map(async (tipo) => {
      const doc = (docsImagen ?? []).find((d) => d.tipo === tipo);
      if (!doc) return;
      const { data: archivo } = await supabase.storage
        .from("documentos")
        .download(doc.archivo_url);
      if (archivo) imagenes[tipo] = Buffer.from(await archivo.arrayBuffer());
    }),
    (async () => {
      if (!instLogo?.logo_url) return;
      const { data: archivo } = await supabase.storage
        .from("documentos")
        .download(instLogo.logo_url);
      if (archivo) imagenes.logo_institucion = Buffer.from(await archivo.arrayBuffer());
    })(),
  ]);
  // Historial para la tabla "procedimientos adjudicados previamente" del
  // F.040 — el sistema la llena solo con lo que ya ganaste.
  const adjudicados = (adjudicadosPrevios ?? []).map((p) => {
    const inst = p.institucion as { nombre?: string } | { nombre?: string }[] | null;
    const f = p.updated_at as string;
    return {
      adj_codigo: p.codigo,
      adj_institucion: (Array.isArray(inst) ? inst[0]?.nombre : inst?.nombre) ?? "",
      adj_objeto: p.objeto ?? "",
      adj_fecha: `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`,
    };
  });

  // Cómo se genera UN documento — la CASCADA completa: la plantilla resuelta
  // (variante de la entidad o genérica de la org) GANA sobre el formulario
  // del sistema — si MITUR exige su propia versión del F.033, sale la de MITUR.
  const generarUno = async (codigo: string): Promise<DocGenerado> => {
    const plantilla = plantillaPorCodigo.get(codigo);
    if (!plantilla) return generarDocumento(codigo, canonico, imagenes, { adjudicados });
    const { data: tpl } = await supabase.storage
      .from("documentos")
      .download(plantilla.archivo_tpl ?? plantilla.archivo_original);
    if (!tpl) {
      throw new Error(`No se pudo leer la plantilla ${plantilla.nombre} (${codigo}).`);
    }
    // Datos: los del expediente + valores fijos de la plantilla + los
    // capturados en el requisito de ESTE proceso.
    const requisito = enPaquete.find((q) => q.codigo === codigo);
    const fijos = Object.fromEntries(
      (plantilla.variables_personalizadas ?? [])
        .filter((v) => v.valor)
        .map((v) => [v.clave, v.valor]),
    );
    const capturados = (requisito?.datos ?? {}) as Record<string, string>;
    return generarDesdeBuffer(
      codigo,
      plantilla.nombre,
      Buffer.from(await tpl.arrayBuffer()),
      canonico,
      imagenes,
      { ...fijos, ...capturados, adjudicados },
    );
  };

  // 4-solo) UN formulario suelto: se genera, se convierte si toca, baja
  //         directo — y en segundo plano queda archivado y su requisito
  //         en "listo", igual que si hubiera salido dentro del paquete.
  if (solo) {
    try {
      const doc = await generarUno(solo);
      const esPdf = formato === "pdf";
      const archivo = esPdf ? doc.archivo.replace(/\.docx$/, ".pdf") : doc.archivo;
      const buffer = esPdf ? await docxAPdf(doc.archivo, doc.buffer) : doc.buffer;
      const contentType = esPdf
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const base = `${miembro.org_id}/licitaciones/${id}/v${canonico.meta.version}`;
      after(async () => {
        try {
          const rutaDoc = `${base}/${archivo}`;
          const { error: errSubida } = await supabase.storage
            .from("documentos")
            .upload(rutaDoc, buffer, { contentType, upsert: true });
          if (!errSubida) {
            await supabase
              .from("lic_requisito")
              .update({ storage_path: rutaDoc, estado: "listo", origen: "generado" })
              .eq("proceso_id", id)
              .eq("org_id", miembro.org_id)
              .eq("codigo", solo);
          }
        } catch (e) {
          console.error("No se pudo archivar el formulario suelto:", e);
        }
      });
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${archivo}"`,
        },
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "No se pudo generar." },
        { status: 500 },
      );
    }
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
        // Versión del MOTOR de render: subirla invalida los ZIP reusados
        // cuando cambia cómo se imprimen los documentos (no solo qué datos).
        // v5: logo institucional en TODOS los formularios del sistema y
        // firma/sello al pie del F.042.
        motor: 5,
        formato,
        unir,
        // El F.040 pinta el logo de la entidad y el historial adjudicado:
        // cambiar cualquiera de los dos debe regenerar.
        logo_institucion: instLogo?.logo_url ?? null,
        adjudicados,
        // El paquete de subsanación es OTRO paquete: misma maquinaria,
        // huella propia (acotada a lo pedido).
        subsanacion: subsanacion?.id ?? null,
        canonico: canonicoSinMeta,
        requisitos: enPaquete
          .map((q) => ({
            codigo: q.codigo,
            datos: q.datos ?? {},
            adjunto: esGenerable(q.codigo)
              ? null
              : q.storage_path ?? q.documento_empresa_id ?? null,
          }))
          .sort((a, b) => a.codigo.localeCompare(b.codigo)),
        sellos: (docsImagen ?? []).map((d) => d.archivo_url),
        // Qué plantilla EXACTA responde cada código (la variante de la
        // entidad cuenta distinto que la genérica, y editarla invalida).
        plantillas: Array.from(new Set(codigos))
          .filter((c) => plantillaPorCodigo.has(c))
          .map((c) => {
            const p = plantillaPorCodigo.get(c)!;
            return { codigo: c, id: p.id, actualizada: p.updated_at };
          })
          .sort((a, b) => a.codigo.localeCompare(b.codigo)),
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

  // 5) Generar todos (las plantillas de la org se DESCARGAN en paralelo).
  let documentos: DocGenerado[];
  try {
    documentos = await Promise.all(codigos.map(generarUno));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo generar." },
      { status: 500 },
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

  const idsDocEmpresa = enPaquete
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

  const ordenados = [...enPaquete].sort((a, b) => {
    const sa = SOBRE[grupoDeRequisito(a.codigo)] ?? "Sobre A";
    const sb = SOBRE[grupoDeRequisito(b.codigo)] ?? "Sobre A";
    if (sa !== sb) return sa < sb ? -1 : 1;
    return (a.orden_indice ?? 0) - (b.orden_indice ?? 0);
  });

  // Los adjuntos se BAJAN (y convierten a PDF si toca) en PARALELO; el
  // ensamblado del ZIP después es puro CPU y conserva el orden de sobres.
  const adjuntoPorRequisito = new Map<
    string,
    { buffer: Buffer; ext: string; origenNota: string }
  >();
  await Promise.all(
    ordenados.map(async (q) => {
      if (generadoPorCodigo.has(q.codigo)) return;
      const ruta =
        q.storage_path ??
        (q.documento_empresa_id
          ? docEmpresaPorId.get(q.documento_empresa_id)?.archivo_url ?? null
          : null);
      if (!ruta) return;
      const { data: adj } = await supabase.storage.from("documentos").download(ruta);
      if (!adj) return;
      let buffer: Buffer = Buffer.from(await adj.arrayBuffer());
      let ext = ruta.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase() ?? "";
      // En el paquete PDF, los adjuntos Word también se convierten; al UNIR,
      // también las imágenes (LibreOffice las pagina) para que entren al
      // PDF del sobre. Si una conversión falla, viaja tal cual (suelta).
      const convertible =
        ext === ".docx" ||
        ext === ".doc" ||
        (unir && [".png", ".jpg", ".jpeg", ".webp"].includes(ext));
      if (formato === "pdf" && convertible) {
        try {
          buffer = await docxAPdf(`adj${ext}`, buffer);
          ext = ".pdf";
        } catch {
          // sin conversión: se anexa en su formato original
        }
      }
      adjuntoPorRequisito.set(q.id, {
        buffer,
        ext,
        origenNota: q.storage_path ? "subido" : "de Empresa",
      });
    }),
  );

  const zip = new PizZipLib();
  const indice: string[] = subsanacion
    ? [
        `SUBSANACIÓN — ${canonico.proceso.codigo}`,
        `Vence: ${subsanacion.fecha_limite.slice(8, 10)}/${subsanacion.fecha_limite.slice(5, 7)}/${subsanacion.fecha_limite.slice(0, 4)} ${subsanacion.fecha_limite.slice(11, 16)}`,
        `Oferente: ${canonico.oferente.razon_social} (RNC ${canonico.oferente.rnc})`,
        "",
        "Documentos pedidos por la entidad:",
        "",
      ]
    : [
        `Expediente ${canonico.proceso.codigo} — versión ${canonico.meta.version}`,
        `Oferente: ${canonico.oferente.razon_social} (RNC ${canonico.oferente.rnc})`,
        "",
      ];
  const sinArchivo: string[] = [];
  const piezas: {
    sobre: string;
    nn: string;
    codigo: string;
    nombre: string;
    buffer: Buffer;
    ext: string;
  }[] = [];
  let n = 0;
  let sobreAnterior = "";
  for (const q of ordenados) {
    // La subsanación va sin sobres: un solo fajo, en el orden pedido.
    const sobre = subsanacion ? "" : SOBRE[grupoDeRequisito(q.codigo)] ?? "Sobre A";
    const gen = generadoPorCodigo.get(q.codigo);

    // De dónde sale el archivo de este requisito (ya descargado arriba).
    let buffer: Buffer | null = null;
    let ext = "";
    let origenNota = "";
    if (gen) {
      buffer = gen.buffer;
      ext = formato === "pdf" ? ".pdf" : ".docx";
      origenNota = "generado";
    } else {
      const adj = adjuntoPorRequisito.get(q.id);
      if (adj) {
        buffer = adj.buffer;
        ext = adj.ext;
        origenNota = adj.origenNota;
      }
    }

    if (sobre && sobre !== sobreAnterior) {
      indice.push(`${sobre}`);
      sobreAnterior = sobre;
    }
    if (buffer) {
      n += 1;
      const nn = String(n).padStart(2, "0");
      piezas.push({ sobre, nn, codigo: q.codigo, nombre: q.nombre, buffer, ext });
      indice.push(`  ${nn} ${q.codigo} — ${q.nombre} (${origenNota})`);
    } else if (requisitoEstandar(q.codigo)?.via === "linea") {
      indice.push(`  ·· ${q.codigo} — ${q.nombre}: la entidad lo verifica en línea, no lleva archivo`);
    } else {
      indice.push(`  ¡FALTA! ${q.codigo} — ${q.nombre}: sin archivo`);
      sinArchivo.push(`${q.codigo} — ${q.nombre}`);
    }
  }

  // Escritura: suelto (lo de siempre) o UNIDO — un PDF por sobre, en el
  // mismo orden del índice; lo no unible viaja aparte y queda declarado.
  const entradaDe = (p: (typeof piezas)[number]) =>
    `${p.sobre ? `${limpio(p.sobre)}/` : ""}${p.nn}_${limpio(p.codigo)}_${limpio(p.nombre)}${p.ext}`;
  if (!unir) {
    for (const p of piezas) zip.file(entradaDe(p), p.buffer);
  } else {
    const grupos = new Map<string, typeof piezas>();
    for (const p of piezas) grupos.set(p.sobre, [...(grupos.get(p.sobre) ?? []), p]);
    indice.push("", "Unidos para subir:");
    for (const [sobre, lista] of grupos) {
      const pdfs = lista.filter((p) => p.ext === ".pdf");
      const sueltas = lista.filter((p) => p.ext !== ".pdf");
      const nombreUnido = limpio(sobre || `Subsanacion_${canonico.proceso.codigo}`) + ".pdf";
      if (pdfs.length > 0) {
        try {
          zip.file(nombreUnido, await unirPdfs(pdfs.map((p) => p.buffer)));
          indice.push(`  ${nombreUnido} — ${pdfs.length} documento${pdfs.length === 1 ? "" : "s"} en orden`);
        } catch {
          // Si la unión falla, nada se pierde: van sueltos como siempre.
          for (const p of pdfs) zip.file(entradaDe(p), p.buffer);
          indice.push(`  (no se pudieron unir los de ${sobre || "la subsanación"} — van sueltos)`);
        }
      }
      for (const p of sueltas) {
        zip.file(entradaDe(p), p.buffer);
        indice.push(`  suelto: ${p.nn} ${p.codigo} (${p.ext} no se une a PDF)`);
      }
    }
  }
  if (sinArchivo.length > 0) {
    indice.push("", "Pendientes de completar antes de presentar:", ...sinArchivo.map((s) => `  - ${s}`));
  }
  zip.file("00_INDICE.txt", indice.join("\n") + "\n");

  const zipFinal: Buffer = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
  let zipNombre = `${subsanacion ? "subsanacion" : "paquete"}_${canonico.proceso.codigo.replace(/[^\w-]+/g, "-")}_v${canonico.meta.version}.zip`;
  if (formato === "pdf") zipNombre = zipNombre.replace(/\.zip$/, unir ? "_pdf_unido.zip" : "_pdf.zip");
  const user = await getUser();

  const base = `${miembro.org_id}/licitaciones/${id}/v${canonico.meta.version}`;
  // ARCHIVAR DESPUÉS DE RESPONDER: el ZIP pesa decenas de MB y subirlo a
  // storage tomaba más tiempo que generarlo (la queja de los "3 minutos").
  // El usuario recibe su descarga ya; el respaldo (ZIP + documentos sueltos
  // + lic_paquete para la idempotencia) se sube en segundo plano.
  after(async () => {
    try {
      await Promise.all([
        supabase.storage
          .from("documentos")
          .upload(`${base}/${zipNombre}`, zipFinal, {
            contentType: "application/zip",
            upsert: true,
          }),
        ...archivos.map(async (doc) => {
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
        }),
      ]);
      // La fila de lic_paquete entra al final: si el respaldo falló, la
      // próxima generación no encuentra huella y simplemente regenera.
      await supabase.from("lic_paquete").insert({
        org_id: miembro.org_id,
        proceso_id: id,
        version: canonico.meta.version,
        payload: canonico,
        payload_hash: huella,
        storage_path: `${base}/${zipNombre}`,
        generado_por: user?.id ?? null,
      });
    } catch (e) {
      console.error("No se pudo archivar el paquete:", e);
    }
  });

  // 8) El ZIP baja directo al navegador.
  return new NextResponse(new Uint8Array(zipFinal), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipNombre}"`,
    },
  });
}
