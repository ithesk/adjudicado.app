// Los ENTREGABLES que Claude produce desde el chat (conector MCP), sin la
// sesión del navegador. SOLO SERVIDOR.
//
//   - La oferta técnica (PROP-TEC): el mismo PDF que «Generar este» en la
//     Bid Room — mismo canónico, mismo diseño, firma, sello y fotos.
//   - Un DOCUMENTO LIBRE: lo que el pliego pida y no tenga formulario
//     (cronograma de entrega, plan de trabajo, matriz de cumplimiento, una
//     carta…). Claude escribe el cuerpo en HTML; aquí se viste con el
//     membrete, la firma y el sello de la empresa y se convierte a PDF.
//
// Cada entregable queda guardado en el requisito del proceso (listo, con su
// archivo) y se devuelve un enlace temporal para revisarlo en el chat.

import { construirCanonico, listarFirmantes, perfilEmpresa, type Acceso } from "./queries";
import type { ProcesoCanonico } from "./contrato";
import type { ImagenesFirma } from "./generador";
import { descargarImagenesItems } from "./imagenes-item";
import {
  cssFuentes,
  esc,
  faltantesOfertaTecnica,
  htmlOfertaTecnica,
  imagenDataUri,
  pieDocumento,
} from "./oferta-tecnica";
import { htmlAPdf, pdfDisponible } from "./pdf";

const BUCKET = "documentos";
const DIAS_ENLACE = 7;

// Logo, firma y sello vigentes de Configuración → Empresa.
async function imagenesEmpresa(a: Acceso): Promise<ImagenesFirma> {
  const { data } = await a.supabase
    .from("documento_empresa")
    .select("tipo, archivo_url, created_at")
    .eq("org_id", a.orgId)
    .in("tipo", ["firma", "sello", "logo"])
    .order("created_at", { ascending: false });
  const imagenes: ImagenesFirma = {};
  await Promise.all(
    (["firma", "sello", "logo"] as const).map(async (tipo) => {
      const doc = (data ?? []).find((d) => d.tipo === tipo);
      if (!doc) return;
      const { data: archivo } = await a.supabase.storage.from(BUCKET).download(doc.archivo_url);
      if (archivo) imagenes[tipo] = Buffer.from(await archivo.arrayBuffer());
    }),
  );
  return imagenes;
}

function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

async function enlace(a: Acceso, ruta: string): Promise<string | null> {
  const { data } = await a.supabase.storage.from(BUCKET).createSignedUrl(ruta, DIAS_ENLACE * 86_400);
  return data?.signedUrl ?? null;
}

// Guarda el PDF en el requisito (lo crea si no existe) y lo deja listo.
async function guardarEnRequisito(
  a: Acceso,
  procesoId: string,
  req: { codigo: string; nombre: string; subsanable: boolean; fuente?: string | null },
  pdf: Buffer,
  archivo: string,
  origen: "generado" | null,
): Promise<{ ruta: string; url: string | null; requisito_creado: boolean }> {
  const ruta = `${a.orgId}/licitaciones/${procesoId}/entregables/${archivo}`;
  const { error: errSubida } = await a.supabase.storage
    .from(BUCKET)
    .upload(ruta, pdf, { contentType: "application/pdf", upsert: true });
  if (errSubida) throw new Error(`No se pudo guardar el PDF: ${errSubida.message}`);

  const { data: existente } = await a.supabase
    .from("lic_requisito")
    .select("id")
    .eq("org_id", a.orgId)
    .eq("proceso_id", procesoId)
    .eq("codigo", req.codigo)
    .maybeSingle();
  if (existente) {
    const { error } = await a.supabase
      .from("lic_requisito")
      .update({ storage_path: ruta, estado: "listo", ...(origen ? { origen } : {}) })
      .eq("id", existente.id)
      .eq("org_id", a.orgId);
    if (error) throw new Error(`No se pudo enlazar al requisito: ${error.message}`);
  } else {
    const { count } = await a.supabase
      .from("lic_requisito")
      .select("id", { count: "exact", head: true })
      .eq("org_id", a.orgId)
      .eq("proceso_id", procesoId);
    const { error } = await a.supabase.from("lic_requisito").insert({
      org_id: a.orgId,
      proceso_id: procesoId,
      codigo: req.codigo,
      nombre: req.nombre,
      subsanable: req.subsanable,
      fuente: req.fuente ?? null,
      firmante_rol: "gerente_general",
      origen: "externo",
      estado: "listo",
      storage_path: ruta,
      orden_indice: count ?? 0,
    });
    if (error) throw new Error(`No se pudo crear el requisito: ${error.message}`);
  }
  return { ruta, url: await enlace(a, ruta), requisito_creado: !existente };
}

// ===== La oferta técnica =====

export async function entregarOfertaTecnica(a: Acceso, procesoId: string) {
  if (!pdfDisponible()) throw new Error("El convertidor PDF no está configurado (GOTENBERG_URL/TOKEN).");
  const r = await construirCanonico(procesoId, a);
  if (r.errores) {
    throw new Error(`El expediente está incompleto: ${r.errores.join(" · ")}`);
  }
  const canonico = r.canonico as ProcesoCanonico;
  const { data: req } = await a.supabase
    .from("lic_requisito")
    .select("datos")
    .eq("org_id", a.orgId)
    .eq("proceso_id", procesoId)
    .eq("codigo", "PROP-TEC")
    .maybeSingle();
  const datos = ((req?.datos ?? {}) as Record<string, string>) ?? {};
  const faltan = faltantesOfertaTecnica(canonico, datos);
  if (faltan.length) throw new Error(`Falta para la oferta técnica: ${faltan.join(" · ")}`);

  const { data: items } = await a.supabase
    .from("lic_item")
    .select("id, numero")
    .eq("org_id", a.orgId)
    .eq("proceso_id", procesoId);
  const [imagenes, fotos] = await Promise.all([
    imagenesEmpresa(a),
    descargarImagenesItems(a.supabase, a.orgId, procesoId, items ?? []),
  ]);
  const { html, pie } = htmlOfertaTecnica(canonico, { datos, imagenes, imagenesItems: fotos.porNumero });
  const pdf = await htmlAPdf(html, pie);
  const archivo = `PROP-TEC_${slug(canonico.proceso.codigo)}.pdf`;
  const g = await guardarEnRequisito(
    a,
    procesoId,
    { codigo: "PROP-TEC", nombre: "Propuesta técnica conforme a las especificaciones", subsanable: false },
    pdf,
    archivo,
    "generado",
  );
  return { archivo, kb: Math.round(pdf.length / 1024), con_fotos: fotos.porNumero.size, ...g };
}

// ===== Documento libre con el membrete de la empresa =====

// El cuerpo lo escribe Claude: se quita lo que no es contenido. Igual el
// Chromium corre sin red y sin JavaScript; esto es higiene, no la defensa.
export function limpiarCuerpo(html: string): string {
  return html
    // Primero con su contenido (el texto de un <script> no es documento)…
    .replace(/<(script|style|iframe|object|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, "")
    // …y después las etiquetas sueltas o sin cierre.
    .replace(/<\/?(script|style|iframe|object|noscript|template|embed|link|meta|base|form)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "");
}

export interface DatosDocumento {
  codigo: string;
  objeto: string | null;
  entidad: string | null;
  razonSocial: string;
  rnc: string;
  rpe: string | null;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  firmante: { nombre: string; cargo: string | null } | null;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre",
];

export function htmlDocumentoLibre(
  d: DatosDocumento,
  op: { titulo: string; cuerpoHtml: string; firmar: boolean; imagenes: ImagenesFirma; fecha?: Date },
): { html: string; pie: string } {
  const hoy = op.fecha ?? new Date();
  const fechaLarga = `${hoy.getDate()} de ${MESES[hoy.getMonth()]} de ${hoy.getFullYear()}`;
  const logo = imagenDataUri(op.imagenes.logo);
  const firma = op.firmar ? imagenDataUri(op.imagenes.firma) : null;
  const sello = op.firmar ? imagenDataUri(op.imagenes.sello) : null;

  const css = `
  ${cssFuentes()}
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{--ink:#1a1c22;--sub:#6b7280;--light:#f8f7f4;--rule:#e8e5de;--rule2:#d0cdc6;--check:#2d6a4f;--accent:#1e2b8f}
  body{font-family:"Manrope",sans-serif;color:var(--ink);font-size:10pt;line-height:1.55;background:#fff}
  .cab{display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:1.5px solid var(--rule2);margin-bottom:18px}
  .cab img{height:46px;width:auto;max-width:200px;object-fit:contain}
  .cab-der{text-align:right}
  .empresa{font-weight:700;font-size:10pt;text-transform:uppercase}
  .meta{font-family:"JetBrains Mono",monospace;font-size:6.5pt;color:var(--sub);margin-top:3px;line-height:1.65}
  .titulo{margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--rule)}
  .antetitulo{font-family:"JetBrains Mono",monospace;font-size:7pt;letter-spacing:.16em;text-transform:uppercase;color:var(--sub);margin-bottom:6px}
  .titulo h1{font-family:"Fraunces",serif;font-size:19pt;font-weight:600;line-height:1.15;margin-bottom:5px}
  .titulo p{font-size:8.5pt;color:var(--sub)}
  .cuerpo h2{font-weight:700;font-size:8pt;letter-spacing:.12em;text-transform:uppercase;margin:18px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--rule);break-after:avoid}
  .cuerpo h3{font-weight:700;font-size:9.5pt;margin:12px 0 6px;break-after:avoid}
  .cuerpo p{margin:0 0 8px;font-size:9.5pt}
  .cuerpo ul,.cuerpo ol{margin:0 0 8px 18px;font-size:9.5pt}
  .cuerpo li{margin-bottom:3px}
  .cuerpo table{width:100%;border-collapse:collapse;font-size:8.5pt;margin:6px 0 12px}
  .cuerpo th{background:var(--ink);color:#fff;text-align:left;padding:6px 8px;font-weight:700;font-size:7.5pt;letter-spacing:.04em;border:1px solid var(--ink)}
  .cuerpo td{padding:5px 8px;border:1px solid var(--rule);vertical-align:top}
  .cuerpo tr{break-inside:avoid}
  .cuerpo tbody tr:nth-child(even) td{background:var(--light)}
  .cuerpo strong{font-weight:700}
  .cuerpo .ok,.cuerpo .check{color:var(--check);font-weight:800}
  .cuerpo img{max-width:100%}
  .firma{margin-top:28px;padding-top:16px;border-top:1px solid var(--rule2);display:flex;justify-content:space-between;align-items:flex-end;break-inside:avoid}
  .firma-izq{position:relative}
  .firma-img{height:56px;width:auto;max-width:200px;display:block;margin-bottom:2px}
  .sello-img{position:absolute;left:150px;bottom:30px;height:92px;width:auto;opacity:.92}
  .linea{width:200px;border-bottom:1px solid var(--rule2);margin-bottom:8px}
  .nombre{font-family:"Fraunces",serif;font-style:italic;font-size:13pt;margin-bottom:3px}
  .rol{font-size:7.5pt;color:var(--sub);line-height:1.65}
  .sello-txt{text-align:right;font-family:"JetBrains Mono",monospace;font-size:6.5pt;color:var(--sub);line-height:1.7}
  `;

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/><title>${esc(op.titulo)}</title><style>${css}</style></head>
<body>
  <div class="cab">
    ${logo ? `<img src="${logo}" alt=""/>` : `<div></div>`}
    <div class="cab-der">
      <div class="empresa">${esc(d.razonSocial)}</div>
      <div class="meta">RNC: ${esc(d.rnc)}${d.rpe ? ` · RPE: ${esc(d.rpe)}` : ""}<br/>${esc(d.direccion)}<br/>${esc(d.telefono)}${d.email ? ` · ${esc(d.email)}` : ""}</div>
    </div>
  </div>
  <div class="titulo">
    <div class="antetitulo">${esc(d.codigo)}</div>
    <h1>${esc(op.titulo)}</h1>
    <p>${esc(d.entidad)}${d.objeto ? ` · ${esc(d.objeto)}` : ""}</p>
  </div>
  <div class="cuerpo">${limpiarCuerpo(op.cuerpoHtml)}</div>
  ${
    op.firmar && d.firmante
      ? `<div class="firma">
    <div class="firma-izq">
      ${firma ? `<img class="firma-img" src="${firma}" alt=""/>` : `<div style="height:56px"></div>`}
      ${sello ? `<img class="sello-img" src="${sello}" alt=""/>` : ""}
      <div class="linea"></div>
      <div class="nombre">${esc(d.firmante.nombre)}</div>
      <div class="rol">${esc(d.firmante.cargo)}<br/>${esc(d.razonSocial)}<br/>RNC: ${esc(d.rnc)}</div>
    </div>
    <div class="sello-txt">Emitido en Santo Domingo, D.N.<br/>${fechaLarga}<br/><br/>Proceso: ${esc(d.codigo)}</div>
  </div>`
      : ""
  }
</body></html>`;
  return { html, pie: pieDocumento(d.razonSocial, d.rnc, d.codigo) };
}

export async function entregarDocumentoLibre(
  a: Acceso,
  procesoId: string,
  op: {
    titulo: string;
    cuerpoHtml: string;
    firmar: boolean;
    requisito: { codigo: string; nombre?: string; subsanable?: boolean; fuente?: string };
  },
) {
  if (!pdfDisponible()) throw new Error("El convertidor PDF no está configurado (GOTENBERG_URL/TOKEN).");
  const [{ data: p }, perfil, firmantes, imagenes] = await Promise.all([
    a.supabase
      .from("lic_proceso")
      .select("codigo, objeto, institucion(nombre)")
      .eq("id", procesoId)
      .eq("org_id", a.orgId)
      .single(),
    perfilEmpresa(a),
    listarFirmantes(a),
    imagenesEmpresa(a),
  ]);
  if (!p) throw new Error("Proceso no encontrado.");
  if (!perfil?.nombre_legal || !perfil.rnc) {
    throw new Error("Faltan la razón social o el RNC de la empresa — Configuración → Empresa.");
  }
  const inst = p.institucion as { nombre?: string } | { nombre?: string }[] | null;
  const gg = firmantes.find((f) => f.rol === "gerente_general") ?? firmantes[0] ?? null;
  const { html, pie } = htmlDocumentoLibre(
    {
      codigo: p.codigo,
      objeto: p.objeto,
      entidad: (Array.isArray(inst) ? inst[0]?.nombre : inst?.nombre) ?? null,
      razonSocial: perfil.nombre_legal,
      rnc: perfil.rnc,
      rpe: perfil.rpe,
      direccion: perfil.direccion,
      telefono: perfil.telefono,
      email: perfil.email,
      firmante: gg ? { nombre: gg.nombre, cargo: gg.cargo } : null,
    },
    { titulo: op.titulo, cuerpoHtml: op.cuerpoHtml, firmar: op.firmar, imagenes },
  );
  const pdf = await htmlAPdf(html, pie);
  const codigo = op.requisito.codigo.trim();
  const archivo = `${slug(codigo)}_${slug(op.titulo)}.pdf`;
  const g = await guardarEnRequisito(
    a,
    procesoId,
    {
      codigo,
      nombre: op.requisito.nombre?.trim() || op.titulo,
      // Ante la duda, crítico: un no-subsanable faltante descalifica.
      subsanable: op.requisito.subsanable ?? false,
      fuente: op.requisito.fuente,
    },
    pdf,
    archivo,
    null,
  );
  return { archivo, kb: Math.round(pdf.length / 1024), ...g };
}
