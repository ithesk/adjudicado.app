// Del texto del expediente a datos: quién ganó qué ítem, quién quedó
// habilitado y por qué, qué subsanaciones se pidieron, el precio por ítem de
// cada oferente y los requisitos del pliego (análisis COMÚN, se guarda en
// lic_expediente). Y, por organización, nuestra comparación: qué pedía el
// pliego frente a lo que subimos, ítem por ítem frente al ganador, causa y
// lecciones (se guarda en lic_resultado).
//
// Lo hace el modelo (llm.ts) con salida JSON con esquema: las actas
// vienen escaneadas, con tablas rotas por firmas y nombres mal escritos, y un
// parser fijo no sobrevive a eso. Cada dato lleva su fuente.

import { extraerJson } from "./llm";

export interface AnalisisExpediente {
  resultado: "adjudicado" | "parcial" | "desierto" | "cancelado" | "en_evaluacion" | "desconocido";
  adjudicaciones: { oferente: string; items: string[]; monto: number | null; fuente: string }[];
  desiertos: { item: string; motivo: string | null }[];
  evaluacion: {
    oferente: string;
    habilitado: boolean | null;
    items_habilitados: string[];
    motivo: string | null;
    fase: "preliminar" | "definitiva" | "economica";
    fuente: string;
  }[];
  subsanaciones: { oferente: string; documentos: string[]; respondio: boolean | null; fuente: string }[];
  precios: {
    oferente: string;
    item: string;
    descripcion: string | null;
    cantidad: number | null;
    precio_unitario: number | null;
    total: number | null;
  }[];
  requisitos_pliego: {
    requisito: string;
    categoria: "legal" | "financiera" | "tecnica" | "economica" | "otra";
    subsanable: boolean | null;
    fuente: string;
  }[];
  criterio_adjudicacion: string | null;
  notas: string[];
}

export interface ComparacionNuestra {
  resultado: "ganado" | "parcial" | "perdido" | "desierto" | "cancelado" | "pendiente";
  causa: "precio" | "descalificacion" | "no_subsano" | "no_ofertado" | "desierto" | "otro" | null;
  explicacion: string;
  cumplimiento: {
    requisito: string;
    subsanable: boolean | null;
    presentado: "si" | "no" | "dudoso";
    archivo: string | null;
    observacion_entidad: string | null;
  }[];
  items: {
    item: string;
    descripcion: string | null;
    nuestro_precio: number | null;
    ganador: string | null;
    precio_ganador: number | null;
    diferencia_pct: number | null;
  }[];
  lecciones: string[];
  patrones_sugeridos: { clave: string; nota: string }[];
}

const s = (description: string) => ({ type: "string", description });
const sn = (description: string) => ({ type: ["string", "null"], description });
const nn = (description: string) => ({ type: ["number", "null"], description });
const arr = (items: object, description?: string) => ({ type: "array", items, ...(description ? { description } : {}) });
const obj = (properties: Record<string, object>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
});

const ESQUEMA_EXPEDIENTE = obj({
  resultado: { type: "string", enum: ["adjudicado", "parcial", "desierto", "cancelado", "en_evaluacion", "desconocido"] },
  adjudicaciones: arr(
    obj({
      oferente: s("Razón social como en el acta"),
      items: arr({ type: "string" }, "Números de ítem o lote adjudicados"),
      monto: nn("Monto adjudicado en RD$"),
      fuente: s("Documento y página, p. ej. 'Acta de adjudicación p. 3'"),
    }),
  ),
  desiertos: arr(obj({ item: s("Ítem o lote"), motivo: sn("Motivo") })),
  evaluacion: arr(
    obj({
      oferente: s("Razón social"),
      habilitado: { type: ["boolean", "null"] },
      items_habilitados: arr({ type: "string" }),
      motivo: sn("Por qué no quedó habilitado o la observación de los peritos"),
      fase: { type: "string", enum: ["preliminar", "definitiva", "economica"] },
      fuente: s("Documento y página"),
    }),
  ),
  subsanaciones: arr(
    obj({
      oferente: s("Razón social"),
      documentos: arr({ type: "string" }, "Documentos que se le pidió subsanar o aclarar"),
      respondio: { type: ["boolean", "null"], description: "true si subsanó, false si no ('no depositó'), null si no consta" },
      fuente: s("Documento y página"),
    }),
  ),
  precios: arr(
    obj({
      oferente: s("Razón social"),
      item: s("Número de ítem o lote"),
      descripcion: sn("Descripción del artículo"),
      cantidad: nn("Cantidad"),
      precio_unitario: nn("Precio unitario ofertado en RD$"),
      total: nn("Total del ítem en RD$"),
    }),
    "Precio por ítem de cada oferente (de los resúmenes de oferta o el informe económico)",
  ),
  requisitos_pliego: arr(
    obj({
      requisito: s("Documento o condición que exige el pliego"),
      categoria: { type: "string", enum: ["legal", "financiera", "tecnica", "economica", "otra"] },
      subsanable: { type: ["boolean", "null"] },
      fuente: s("Documento y página"),
    }),
  ),
  criterio_adjudicacion: sn("Criterio de adjudicación (menor precio, por ítem, por lote…)"),
  notas: arr({ type: "string" }, "Otros hechos relevantes (impugnaciones, cancelaciones, errores aritméticos corregidos…)"),
});

const ESQUEMA_COMPARACION = obj({
  resultado: { type: "string", enum: ["ganado", "parcial", "perdido", "desierto", "cancelado", "pendiente"] },
  causa: {
    type: ["string", "null"],
    enum: ["precio", "descalificacion", "no_subsano", "no_ofertado", "desierto", "otro", null],
  },
  explicacion: s("2-4 frases: por qué ganamos o perdimos, citando el documento"),
  cumplimiento: arr(
    obj({
      requisito: s("Requisito del pliego"),
      subsanable: { type: ["boolean", "null"] },
      presentado: { type: "string", enum: ["si", "no", "dudoso"] },
      archivo: sn("Archivo nuestro que lo cubre"),
      observacion_entidad: sn("Lo que dijeron los peritos de ese requisito en nuestra oferta"),
    }),
  ),
  items: arr(
    obj({
      item: s("Ítem o lote"),
      descripcion: sn("Descripción"),
      nuestro_precio: nn("Nuestro total del ítem"),
      ganador: sn("Quién lo ganó"),
      precio_ganador: nn("Total del ganador en el ítem"),
      diferencia_pct: nn("(nuestro - ganador) / ganador × 100"),
    }),
  ),
  lecciones: arr({ type: "string" }, "Acciones concretas para la próxima vez"),
  patrones_sugeridos: arr(
    obj({ clave: s("p. ej. carta_fabricante, linea_credito, rigor_subsanacion"), nota: s("1-2 líneas citando el proceso") }),
    "Lo RECURRENTE de la institución que conviene recordar",
  ),
});

const SISTEMA = `Eres perito en compras públicas de la República Dominicana (Ley 47-25, Decreto 52-26, formatos SNCC). Extraes datos de expedientes del portal ComprasDominicana con rigor:
- Solo lo que dicen los documentos. Lo que no consta es null; no lo deduzcas.
- Los PDF vienen de OCR: nombres y cifras pueden estar mal escritos o descolocados por firmas y sellos. Cruza documentos (acta, informes, resúmenes de oferta, lista de ofertas) para ubicar bien cada dato; si una tabla está rota y no se puede saber, dilo en notas.
- Cita la fuente de cada dato (documento y página).
- Montos en RD$ como número (sin símbolo ni comas).`;

/** Documentos → análisis común del expediente. `documentos`: [{ruta, texto}] ya recortados. */
export function analizarExpediente(codigo: string, documentos: { ruta: string; texto: string }[]) {
  const cuerpo =
    `Proceso ${codigo}. Documentos del expediente:\n\n` +
    documentos.map((d) => `=== ${d.ruta} ===\n${d.texto}`).join("\n\n");
  return extraerJson<AnalisisExpediente>(SISTEMA, cuerpo, "analisis_expediente", ESQUEMA_EXPEDIENTE);
}

export interface DatosComparacion {
  codigo: string;
  nosotros: string;
  analisis: AnalisisExpediente | null;
  ofertas: unknown[];
  adjudicaciones: unknown[];
  nuestrosArchivos: { ruta: string; inicio: string | null }[];
  textoNuestraOferta: string | null;
}

/** Nuestra oferta frente al pliego y al ganador. */
export function compararNuestra(d: DatosComparacion) {
  const cuerpo = [
    `Proceso ${d.codigo}. NUESTRA empresa: ${d.nosotros}.`,
    `Análisis del expediente (común):\n${JSON.stringify(d.analisis ?? {}, null, 1)}`,
    `Ofertas (API DGCP):\n${JSON.stringify(d.ofertas)}`,
    `Adjudicaciones (API DGCP):\n${JSON.stringify(d.adjudicaciones)}`,
    `Archivos que SUBIMOS (ruta y comienzo del texto):\n` +
      d.nuestrosArchivos.map((a) => `- ${a.ruta}${a.inicio ? `\n  «${a.inicio}»` : ""}`).join("\n"),
    d.textoNuestraOferta ? `Nuestro resumen de oferta / oferta técnica:\n${d.textoNuestraOferta}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return extraerJson<ComparacionNuestra>(
    SISTEMA +
      "\nAhora comparas la oferta de NUESTRA empresa con lo que pedía el pliego y con el ganador, para un informe de por qué ganamos o perdimos. Para 'presentado' básate en los archivos que subimos (nombre y contenido) y en lo que dijeron los peritos; si no se puede saber, 'dudoso'.",
    cuerpo,
    "comparacion_nuestra",
    ESQUEMA_COMPARACION,
  );
}
