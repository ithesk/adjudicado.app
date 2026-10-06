// La OFERTA TÉCNICA (PROP-TEC): el documento con el que la empresa declara
// qué ofrece y cómo cumple cada especificación del pliego — SIN PRECIOS (los
// precios van solo en el F.033). SOLO SERVIDOR (lee las fuentes del disco).
//
// A diferencia de los formularios SNCC no hay formato oficial: es papel de la
// empresa, con el diseño editorial que ya se usaba (el «Sistema Editorial v3»
// de la skill licitacion-rd-analyzer), ahora alimentado por el expediente:
//   - cabecera y oferente  → snapshot del canónico (Configuración → Empresa)
//   - ítems                → lo ofertado (marca, modelo, descripción) frente a
//                            la spec del pliego TAL CUAL
//   - validez, plazo, lugar, garantía → preguntas del requisito (datos)
//   - logo, firma y sello  → imágenes de Configuración → Empresa
//
// Se renderiza a HTML AUTOCONTENIDO (fuentes e imágenes en base64) porque el
// Chromium de Gotenberg corre sin red; ver infra/gotenberg/README.md.

import fs from "node:fs";
import path from "node:path";
import type { ProcesoCanonico } from "./contrato";
import { formatoRealDeImagen, type ImagenesFirma } from "./generador";
import { PREGUNTAS_SISTEMA } from "./requisitos-estandar";
import { MODALIDAD_LABEL } from "./tipos";

const DIR_FUENTES = path.join(process.cwd(), "plantillas", "oferta-tecnica", "fuentes");

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre",
];

function esc(s: string | number | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let fuentesCss: string | null = null;
function cssFuentes(): string {
  if (fuentesCss) return fuentesCss;
  const cara = (familia: string, archivo: string, estilo: string, pesos: string) => {
    const b64 = fs.readFileSync(path.join(DIR_FUENTES, archivo)).toString("base64");
    return `@font-face{font-family:"${familia}";font-style:${estilo};font-weight:${pesos};src:url(data:font/woff2;base64,${b64}) format("woff2");}`;
  };
  fuentesCss = [
    cara("Manrope", "Manrope-normal.woff2", "normal", "300 800"),
    cara("Fraunces", "Fraunces-normal.woff2", "normal", "300 600"),
    cara("Fraunces", "Fraunces-italic.woff2", "italic", "400"),
    cara("JetBrains Mono", "JetBrainsMono-normal.woff2", "normal", "400 600"),
  ].join("\n");
  return fuentesCss;
}

function imagenDataUri(buf: Buffer | null | undefined): string | null {
  if (!buf) return null;
  const formato = formatoRealDeImagen(buf);
  return formato ? `data:image/${formato};base64,${buf.toString("base64")}` : null;
}

// Las preguntas obligatorias que faltan, en cristiano (para el 422).
export function faltantesOfertaTecnica(
  canonico: ProcesoCanonico,
  datos: Record<string, string>,
): string[] {
  const faltan: string[] = [];
  for (const p of PREGUNTAS_SISTEMA["PROP-TEC"]) {
    if (!datos[p.clave]?.trim()) {
      faltan.push(`Oferta técnica: falta «${p.etiqueta}» — complétalo en el requisito (2 · Requisitos)`);
    }
  }
  for (const l of canonico.lotes) {
    for (const it of l.items) {
      if (it.ofertamos && !it.producto) {
        faltan.push(
          `Oferta técnica: el ítem ${it.numero} no tiene marca, modelo y descripción de lo ofertado — complétalo en 3 · Ítems`,
        );
      }
    }
  }
  return faltan;
}

// La descripción de lo ofertado: la primera línea es el resumen; las demás
// (con o sin viñeta) son los puntos de cumplimiento frente al pliego.
export function partirDescripcion(descripcion: string): { resumen: string; puntos: string[] } {
  const lineas = descripcion
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const [resumen = "", ...resto] = lineas;
  return { resumen, puntos: resto.map((l) => l.replace(/^[-•*✓✔·]\s*/, "")) };
}

// «Clave: valor» → clave en negrita, como en el diseño original.
function puntoHtml(p: string): string {
  const m = p.match(/^([^:]{2,40}):\s*(.+)$/);
  return m ? `<strong>${esc(m[1])}:</strong> ${esc(m[2])}` : esc(p);
}

function conDias(v: string): string {
  return /^\d+$/.test(v.trim()) ? `${v.trim()} días` : v;
}

export interface OpcionesOferta {
  datos: Record<string, string>;
  imagenes: ImagenesFirma;
  fecha?: Date;
}

export function htmlOfertaTecnica(c: ProcesoCanonico, op: OpcionesOferta): { html: string; pie: string } {
  const d = op.datos;
  const hoy = op.fecha ?? new Date();
  const fechaCorta = `${String(hoy.getDate()).padStart(2, "0")}/${String(hoy.getMonth() + 1).padStart(2, "0")}/${hoy.getFullYear()}`;
  const fechaLarga = `${hoy.getDate()} de ${MESES[hoy.getMonth()]} de ${hoy.getFullYear()}`;
  const o = c.oferente;
  const gg = c.firmantes.find((f) => f.rol === "gerente_general") ?? c.firmantes[0];
  const codigoDoc = d.codigo_documento?.trim() || `OT-${c.proceso.codigo}`;
  const modalidad = MODALIDAD_LABEL[c.proceso.modalidad] ?? c.proceso.modalidad;
  const moneda = c.proceso.moneda === "USD" ? "Dólares estadounidenses (US$)" : "Pesos dominicanos (RD$)";
  const monedaFrase = c.proceso.moneda === "USD" ? "dólares estadounidenses (US$)" : "pesos dominicanos (RD$)";
  const validez = conDias(d.validez_dias ?? "");
  const plazo = conDias(d.plazo_entrega ?? "");
  const lugar = d.lugar_entrega ?? "";
  const garantia = d.garantia ?? "";
  const logo = imagenDataUri(op.imagenes.logo);
  const firma = imagenDataUri(op.imagenes.firma);
  const sello = imagenDataUri(op.imagenes.sello);

  const items = c.lotes.flatMap((l) =>
    l.items.filter((i) => i.ofertamos).map((i) => ({ ...i, lote: c.lotes.length > 1 ? l : null })),
  );

  const filasResumen = items
    .map((i) => {
      const p = i.producto!;
      return `<tr>
        <td class="num">${i.numero}</td>
        <td>${esc(`${p.marca} ${p.modelo}`)}${p.parte ? ` <span class="mono sub">· ${esc(p.parte)}</span>` : ""}${i.lote ? `<div class="sub">Lote ${i.lote.numero}${i.lote.nombre ? ` — ${esc(i.lote.nombre)}` : ""}</div>` : ""}</td>
        <td class="centro">${esc(i.cantidad)}</td>
        <td class="centro">${esc(i.unidad)}</td>
        <td class="centro chico">${esc(garantia)}</td>
      </tr>`;
    })
    .join("");

  const tarjetas = items
    .map((i) => {
      const p = i.producto!;
      const { resumen, puntos } = partirDescripcion(p.descripcion);
      const cumplimiento = puntos.length
        ? `<ul class="specs">${puntos.map((x) => `<li><span class="check">✓</span><span>${puntoHtml(x)}</span></li>`).join("")}</ul>`
        : `<p class="valor">${esc(resumen)}</p>`;
      return `<div class="item">
        <div class="item-cab">
          <div class="item-titulo">ÍTEM ${i.numero} — ${esc(`${p.marca} ${p.modelo}`.toUpperCase())}</div>
          <div class="pastilla">${esc(i.cantidad)} ${esc(i.unidad)}${p.parte ? ` · ${esc(p.parte)}` : ""}</div>
        </div>
        <div class="item-cuerpo">
          <div>
            <div class="etiqueta">Requerimiento del pliego</div>
            <div class="pliego">${esc(i.spec_cruda)}</div>
            ${puntos.length ? `<div class="etiqueta">Descripción</div><div class="valor">${esc(resumen)}</div>` : ""}
            <div class="etiqueta">Garantía</div>
            <div class="valor">${esc(garantia)}</div>
          </div>
          <div>
            <div class="etiqueta">Lo que ofertamos y cómo cumple</div>
            ${cumplimiento}
          </div>
        </div>
      </div>`;
    })
    .join("");

  const condiciones = [
    `Los bienes ofertados son originales y nuevos, en su empaque sellado de fábrica, adquiridos a través de los canales autorizados del fabricante en la República Dominicana.`,
    `Garantía: ${garantia}, contada a partir de la fecha de entrega y recepción conforme.`,
    `La entrega se realizará en ${lugar}, en coordinación con la contraparte designada por ${c.proceso.entidad.nombre}, dentro de un plazo de ${plazo} a partir de la notificación de la orden de compra o del contrato.`,
    `La presente oferta es válida por ${validez} a partir de la fecha de presentación. Los precios se presentan exclusivamente en el formulario de Oferta Económica (SNCC.F.033), en ${monedaFrase}.`,
    `${o.razon_social} emitirá los comprobantes fiscales electrónicos (e-CF) conforme a la Ley 32-23 de Facturación Electrónica y sus normas de aplicación.`,
    `Soporte post-venta durante toda la vigencia de la garantía, a través de los canales oficiales del fabricante y del equipo técnico de ${o.razon_social}.`,
    `${o.razon_social} declara que la presente oferta es auténtica, libre de colusión y de cualquier práctica restrictiva de la libre competencia, elaborada de buena fe con la intención de aceptar la adjudicación, conforme a la Ley 47-25.`,
  ];

  const css = `
  ${cssFuentes()}
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{--ink:#1a1c22;--sub:#6b7280;--light:#f8f7f4;--rule:#e8e5de;--rule2:#d0cdc6;--check:#2d6a4f;--accent:#1e2b8f}
  body{font-family:"Manrope",sans-serif;color:var(--ink);font-size:10pt;line-height:1.55;background:#fff}
  .mono{font-family:"JetBrains Mono",monospace}
  .sub{color:var(--sub);font-size:7.5pt}
  .cab{display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:1.5px solid var(--rule2);margin-bottom:18px}
  .cab img{height:46px;width:auto;max-width:200px;object-fit:contain}
  .cab-der{text-align:right}
  .empresa{font-weight:700;font-size:10pt;text-transform:uppercase}
  .meta{font-family:"JetBrains Mono",monospace;font-size:6.5pt;color:var(--sub);margin-top:3px;line-height:1.65}
  .titulo{margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--rule)}
  .antetitulo{font-family:"JetBrains Mono",monospace;font-size:7pt;letter-spacing:.16em;text-transform:uppercase;color:var(--sub);margin-bottom:6px}
  .titulo h1{font-family:"Fraunces",serif;font-size:21pt;font-weight:600;line-height:1.15;margin-bottom:5px}
  .titulo p{font-size:8.5pt;color:var(--sub)}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:22px}
  .kpi{background:var(--light);border:1px solid var(--rule);border-radius:4px;padding:8px 10px}
  .kpi-et{font-family:"JetBrains Mono",monospace;font-size:6pt;text-transform:uppercase;letter-spacing:.1em;color:var(--sub);margin-bottom:3px}
  .kpi-val{font-weight:700;font-size:9.5pt;line-height:1.2;overflow-wrap:anywhere}
  .kpi-val.mono{font-size:7.5pt}
  .seccion{display:flex;align-items:center;gap:8px;margin:20px 0 10px;break-after:avoid}
  .seccion .n{font-family:"JetBrains Mono",monospace;font-size:7pt;color:var(--sub);min-width:22px}
  .seccion .t{font-weight:700;font-size:7.5pt;letter-spacing:.12em;text-transform:uppercase}
  .seccion .r{flex:1;height:1px;background:var(--rule)}
  table{width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:16px}
  .datos td{padding:5px 9px;border:1px solid var(--rule);vertical-align:top}
  .datos td:first-child{font-weight:600;color:var(--sub);background:var(--light);width:34%;font-size:8pt}
  .bienes thead td{background:var(--ink);color:#fff;padding:7px 9px;font-weight:700;font-size:7.5pt;letter-spacing:.05em;border:1px solid var(--ink)}
  .bienes tbody td{padding:6px 9px;border:1px solid var(--rule);vertical-align:middle}
  .bienes tbody tr:nth-child(even) td{background:var(--light)}
  .bienes tr{break-inside:avoid}
  .num{font-family:"JetBrains Mono",monospace;font-size:8pt;font-weight:600;color:var(--sub);text-align:center;width:6%}
  .centro{text-align:center}
  .chico{font-size:8pt}
  .item{border:1px solid var(--rule);border-radius:5px;margin-bottom:16px;overflow:hidden;break-inside:avoid}
  .item-cab{background:var(--light);border-bottom:1px solid var(--rule2);padding:8px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px}
  .item-titulo{font-weight:800;font-size:9pt;letter-spacing:.02em}
  .pastilla{font-family:"JetBrains Mono",monospace;font-size:6.5pt;color:var(--sub);background:var(--rule);padding:2px 7px;border-radius:10px;white-space:nowrap}
  .item-cuerpo{padding:12px 14px;display:grid;grid-template-columns:1fr 1.6fr;gap:16px}
  .etiqueta{font-family:"JetBrains Mono",monospace;font-size:6.5pt;text-transform:uppercase;letter-spacing:.1em;color:var(--sub);margin:10px 0 4px}
  .etiqueta:first-child{margin-top:0}
  .valor{font-size:8.5pt;line-height:1.5}
  .pliego{font-size:7.5pt;line-height:1.5;color:var(--sub);white-space:pre-wrap;border-left:2px solid var(--rule2);padding-left:8px}
  .specs{list-style:none}
  .specs li{display:flex;gap:6px;font-size:7.5pt;padding:3.5px 0;border-bottom:1px solid var(--rule);line-height:1.45}
  .specs li:last-child{border-bottom:none}
  .check{color:var(--check);font-weight:800;font-size:8pt;flex-shrink:0}
  .condiciones{list-style:none;margin-bottom:22px}
  .condiciones li{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--rule);font-size:8.5pt;line-height:1.5;break-inside:avoid}
  .condiciones li:last-child{border-bottom:none}
  .condiciones .n{font-family:"JetBrains Mono",monospace;font-size:7pt;font-weight:600;color:var(--sub);min-width:20px;margin-top:2px}
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
<html lang="es"><head><meta charset="utf-8"/>
<title>Oferta Técnica · ${esc(c.proceso.codigo)}</title>
<style>${css}</style></head>
<body>
  <div class="cab">
    ${logo ? `<img src="${logo}" alt=""/>` : `<div></div>`}
    <div class="cab-der">
      <div class="empresa">${esc(o.razon_social)}</div>
      <div class="meta">RNC: ${esc(o.rnc)} · RPE: ${esc(o.rpe)}<br/>${esc(o.direccion)}<br/>${esc(o.telefono)} · ${esc(o.email)}</div>
    </div>
  </div>

  <div class="titulo">
    <div class="antetitulo">Oferta Técnica · ${esc(modalidad)} · Ley 47-25</div>
    <h1>${esc(c.proceso.objeto)}</h1>
    <p>${esc(c.proceso.entidad.nombre)} · ${esc(c.proceso.codigo)}</p>
  </div>

  <div class="kpis">
    <div class="kpi"><div class="kpi-et">Referencia</div><div class="kpi-val mono">${esc(codigoDoc)}</div></div>
    <div class="kpi"><div class="kpi-et">Fecha de emisión</div><div class="kpi-val">${fechaCorta}</div></div>
    <div class="kpi"><div class="kpi-et">Validez de la oferta</div><div class="kpi-val">${esc(validez)}</div></div>
    <div class="kpi"><div class="kpi-et">Plazo de entrega</div><div class="kpi-val">${esc(plazo)}</div></div>
  </div>

  <div class="seccion"><span class="n">01</span><span class="t">Datos del proceso</span><div class="r"></div></div>
  <table class="datos"><tbody>
    <tr><td>Entidad contratante</td><td>${esc(c.proceso.entidad.nombre)}</td></tr>
    <tr><td>Número de expediente</td><td class="mono">${esc(c.proceso.codigo)}</td></tr>
    <tr><td>Objeto</td><td>${esc(c.proceso.objeto)}</td></tr>
    <tr><td>Oferente</td><td>${esc(o.razon_social)}</td></tr>
    <tr><td>RNC / RPE del oferente</td><td class="mono">${esc(o.rnc)} / ${esc(o.rpe)}</td></tr>
    <tr><td>Modalidad</td><td>${esc(modalidad)}</td></tr>
    <tr><td>Moneda</td><td>${esc(moneda)}</td></tr>
    <tr><td>Lugar de entrega</td><td>${esc(lugar)}</td></tr>
  </tbody></table>

  <div class="seccion"><span class="n">02</span><span class="t">Bienes y servicios ofertados</span><div class="r"></div></div>
  <table class="bienes">
    <thead><tr><td class="centro">#</td><td>Descripción de lo ofertado</td><td class="centro" style="width:9%">Cant.</td><td class="centro" style="width:9%">Unidad</td><td class="centro" style="width:20%">Garantía</td></tr></thead>
    <tbody>${filasResumen}</tbody>
  </table>

  <div class="seccion"><span class="n">03</span><span class="t">Especificaciones técnicas y cumplimiento</span><div class="r"></div></div>
  ${tarjetas}

  <div class="seccion"><span class="n">04</span><span class="t">Condiciones generales de la oferta</span><div class="r"></div></div>
  <ol class="condiciones">
    ${condiciones.map((t, i) => `<li><span class="n">${String(i + 1).padStart(2, "0")}.</span><span>${esc(t)}</span></li>`).join("")}
  </ol>

  <div class="firma">
    <div class="firma-izq">
      ${firma ? `<img class="firma-img" src="${firma}" alt=""/>` : `<div style="height:56px"></div>`}
      ${sello ? `<img class="sello-img" src="${sello}" alt=""/>` : ""}
      <div class="linea"></div>
      <div class="nombre">${esc(gg?.nombre)}</div>
      <div class="rol">${esc(gg?.cargo)}<br/>${esc(o.razon_social)}<br/>RNC: ${esc(o.rnc)}<br/>${esc(o.email)}</div>
    </div>
    <div class="sello-txt">
      Emitido en Santo Domingo, D.N.<br/>${fechaLarga}<br/><br/>
      Ref.: ${esc(codigoDoc)}<br/>Proceso: ${esc(c.proceso.codigo)}
    </div>
  </div>
</body></html>`;

  // El pie lo pinta Chromium en cada página (los números de página solo
  // existen ahí). Va sin fuentes propias: la plantilla de pie no las carga.
  // Tabla y no flex: la plantilla de pie de Chromium no reparte el ancho.
  const pie = `<html><head><style>
    body{margin:0 13mm;font-family:monospace;font-size:6.5pt;color:#6b7280;-webkit-print-color-adjust:exact}
    table{width:100%;border-collapse:collapse;border-top:1px solid #e8e5de}
    td{padding-top:5px}
  </style></head><body><table><tr>
    <td>${esc(o.razon_social)} · RNC ${esc(o.rnc)} · ${esc(c.proceso.codigo)}</td>
    <td style="text-align:right;white-space:nowrap">Página <span class="pageNumber"></span> de <span class="totalPages"></span></td>
  </tr></table></body></html>`;

  return { html, pie };
}
