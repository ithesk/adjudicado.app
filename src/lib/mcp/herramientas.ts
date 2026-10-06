// Las herramientas que adjudicado.app le ofrece a Claude por MCP. Juntas
// cubren el flujo que antes eran dos skills sueltas:
//
//   buscar_oportunidades → ver_proceso → leer_documento (pliego, ficha)
//     → [Claude analiza en el chat con el usuario] → importar_proceso
//
// y la memoria institucional (patrones por entidad) vive en la base, no en
// la memoria de un chat: la ve todo el equipo y ver_proceso la trae sola.

import { z } from "zod";
import * as dgcp from "@/lib/dgcp/api";
import { normalizar, radar, siglasDesdeCodigo, type Nivel } from "@/lib/dgcp/relevancia";
import { extraerTexto, tramo } from "@/lib/dgcp/texto";
import { transcribirPdf } from "@/lib/ocr";
import { ESTADOS_LICITACION } from "@/lib/licitaciones/tipos";
import {
  CODIGOS_REQUISITO,
  capacidades,
  guardarPatron,
  importarProceso,
  listarProcesos,
  patronesDe,
  perfilEmpresa,
  procesosPorCodigo,
  resolverInstitucion,
  type Ctx,
} from "./datos";

export interface CtxHerramienta extends Ctx {
  /** Origen de la app, para devolver enlaces a la Bid Room. */
  baseUrl: string;
}

export interface Herramienta {
  nombre: string;
  titulo: string;
  descripcion: string;
  entrada: z.ZodObject;
  soloLectura: boolean;
  ejecutar: (args: never, ctx: CtxHerramienta) => Promise<unknown>;
}

function definir<S extends z.ZodObject>(h: {
  nombre: string;
  titulo: string;
  descripcion: string;
  entrada: S;
  soloLectura: boolean;
  ejecutar: (args: z.infer<S>, ctx: CtxHerramienta) => Promise<unknown>;
}): Herramienta {
  return h as unknown as Herramienta;
}

const ORDEN_NIVEL: Record<Nivel, number> = { alta: 3, media: 2, explorar: 1 };

// "pliego", "ficha", un número de la lista o parte del nombre del archivo.
// El tipo EXACTO gana: el «Acto de aprobación de … Pliego de Condiciones»
// también contiene «pliego de condiciones» y no es el pliego.
function elegirDocumento(docs: dgcp.DgcpDocumento[], ref: string | number) {
  if (typeof ref === "number" || /^\d+$/.test(String(ref))) return docs[Number(ref) - 1] ?? null;
  const r = normalizar(String(ref));
  const porTipo = (t: string) =>
    docs.find((d) => normalizar(d.tipo_documento).trim().startsWith(t)) ??
    docs.find((d) => normalizar(d.tipo_documento).includes(t) && !normalizar(d.tipo_documento).startsWith("acto"));
  const porNombre = (t: string) => docs.find((d) => normalizar(d.nombre_documento).includes(t));
  if (r === "pliego") return porTipo("pliego de condiciones") ?? porNombre("pliego") ?? null;
  if (r === "ficha" || r === "ficha tecnica" || r === "especificaciones") {
    return porTipo("especificaciones/ficha tecnica") ?? porNombre("ficha") ?? porTipo("ficha tecnica") ?? null;
  }
  return porNombre(r) ?? docs.find((d) => normalizar(d.tipo_documento).includes(r)) ?? null;
}

// Páginas máximas que se mandan a transcribir: un escaneado más largo se
// lee mejor adjuntándolo en el chat.
const MAX_PAGINAS_OCR = 15;

const codigoProceso = z
  .string()
  .min(5)
  .describe("Código del proceso en ComprasDominicana, p. ej. OGTIC-CCC-CP-2026-0011");

export const HERRAMIENTAS: Herramienta[] = [
  definir({
    nombre: "buscar_oportunidades",
    titulo: "Buscar oportunidades en la DGCP",
    descripcion:
      "Revisa TODOS los procesos abiertos («Proceso publicado») de ComprasDominicana y devuelve los relevantes para la empresa, " +
      "ordenados por puntaje (urgencia×3 + relevancia×2 + valor). Relevancia 'alta' = menciona un socio de la empresa " +
      "(lic_capability) o uno de sus productos (FortiGate → Fortinet, ThinkPad → Lenovo…); 'media' = producto/marca TI; " +
      "'explorar' = TI genérico. `dias_restantes` y `cierre_rd` van en hora de RD (0 = cierra hoy). Marca los que ya están en adjudicado.app.",
    soloLectura: true,
    entrada: z.object({
      texto: z.string().optional().describe("Filtrar por palabras en el título (todas deben aparecer). Sin texto, usa el vocabulario TI."),
      nivel_minimo: z.enum(["alta", "media", "explorar"]).default("explorar"),
      dias_max: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe("Solo los que cierran en ≤ N días de calendario, hora de RD: 0 = hoy, 1 = hasta mañana"),
      palabras_extra: z.array(z.string()).optional().describe("Palabras clave adicionales a tratar como relevancia media"),
      limite: z.number().int().min(1).max(100).default(25),
    }),
    async ejecutar(a, ctx) {
      const [{ procesos, paginasFallidas }, caps] = await Promise.all([dgcp.listarProcesos(), capacidades(ctx)]);
      const todas = radar(procesos, {
        socios: caps.socios,
        bloqueados: caps.bloqueados,
        palabrasExtra: a.palabras_extra,
        texto: a.texto,
      }).filter(
        (o) =>
          ORDEN_NIVEL[o.nivel] >= ORDEN_NIVEL[a.nivel_minimo] &&
          (a.dias_max == null || (o.dias_restantes != null && o.dias_restantes <= a.dias_max)),
      );
      const lista = todas.slice(0, a.limite);
      const enApp = await procesosPorCodigo(ctx, lista.map((o) => o.codigo));
      return {
        escaneados: procesos.length,
        paginas_fallidas: paginasFallidas,
        relevantes: todas.length,
        cierran_en_7_dias: todas.filter((o) => (o.dias_restantes ?? 99) <= 7).length,
        socios_de_la_empresa: caps.socios,
        oportunidades: lista.map((o) => {
          const p = enApp.get(o.codigo);
          return {
            ...o,
            en_adjudicado: p ? { estado: p.estado, url: `${ctx.baseUrl}/licitaciones/${p.id}` } : null,
          };
        }),
      };
    },
  }),

  definir({
    nombre: "ver_proceso",
    titulo: "Ver un proceso de la DGCP",
    descripcion:
      "Ficha completa de un proceso: datos y fechas de la DGCP, artículos con cantidades y precio estimado, la lista NUMERADA " +
      "de documentos (pliego, ficha técnica, formularios…), si ya está en adjudicado.app y los PATRONES conocidos de la " +
      "institución convocante (memoria del equipo). Llamar antes de analizar.",
    soloLectura: true,
    entrada: z.object({ codigo: codigoProceso }),
    async ejecutar({ codigo }, ctx) {
      const [proceso, articulos, documentos, enApp] = await Promise.all([
        dgcp.obtenerProceso(codigo),
        dgcp.listarArticulos(codigo),
        dgcp.listarDocumentos(codigo),
        procesosPorCodigo(ctx, [codigo]),
      ]);
      if (!proceso) throw new Error(`La DGCP no tiene un proceso con código ${codigo}.`);
      const inst = await resolverInstitucion(
        ctx,
        { siglas: siglasDesdeCodigo(codigo), nombre: proceso.unidad_compra },
        false,
      );
      const p = enApp.get(codigo);
      return {
        proceso,
        articulos,
        documentos: documentos.map((d, i) => ({
          n: i + 1,
          nombre: d.nombre_documento,
          tipo: d.tipo_documento.trim(),
          fecha: d.fecha_carga_archivo,
        })),
        en_adjudicado: p ? { estado: p.estado, url: `${ctx.baseUrl}/licitaciones/${p.id}` } : null,
        patrones_institucion: inst ? await patronesDe(ctx, inst.id) : [],
      };
    },
  }),

  definir({
    nombre: "leer_documento",
    titulo: "Leer un documento del proceso",
    descripcion:
      "Descarga del portal un documento del proceso y devuelve su TEXTO por tramos de páginas. `documento` acepta el número " +
      "de la lista de ver_proceso, 'pliego', 'ficha' o parte del nombre. Si el resultado trae `hay_mas`, pedir el siguiente " +
      "tramo con desde_pagina = hasta + 1. Los PDF escaneados (frecuentes en compras menores) se transcriben con OCR " +
      "automáticamente (`ocr: true` en la respuesta: revisar cifras críticas contra el original si algo no cuadra).",
    soloLectura: true,
    entrada: z.object({
      codigo: codigoProceso,
      documento: z.union([z.number().int().positive(), z.string().min(1)]),
      desde_pagina: z.number().int().positive().default(1),
      max_caracteres: z.number().int().min(5_000).max(120_000).default(60_000),
    }),
    async ejecutar(a) {
      const docs = await dgcp.listarDocumentos(a.codigo);
      const doc = elegirDocumento(docs, a.documento);
      if (!doc) {
        throw new Error(
          `No encontré el documento «${a.documento}» (las compras menores no suelen traer pliego). Disponibles: ` +
            docs.map((d, i) => `${i + 1}. ${d.nombre_documento} [${d.tipo_documento.trim()}]`).join("; "),
        );
      }
      const { bytes } = await dgcp.descargarDocumento(doc.url_documento);
      const texto = await extraerTexto(doc.nombre_documento, bytes);
      const base = { documento: doc.nombre_documento, tipo: doc.tipo_documento.trim(), formato: texto.formato };
      if (texto.formato === "otro") {
        return { ...base, aviso: "Formato no legible como texto.", url: doc.url_documento };
      }
      let ocr = false;
      if (texto.escaneado) {
        if (texto.paginas.length > MAX_PAGINAS_OCR) {
          return {
            ...base,
            aviso: `PDF escaneado de ${texto.paginas.length} páginas (el OCR automático llega a ${MAX_PAGINAS_OCR}). Pide al usuario que lo adjunte en el chat.`,
            url: doc.url_documento,
          };
        }
        const transcrito = await transcribirPdf(Buffer.from(bytes).toString("base64"));
        const paginas = transcrito.split(/^-{3}\s*p[aá]gina\s+\d+\s*-{3}\s*$/im).map((p) => p.trim()).filter(Boolean);
        texto.paginas = paginas.length ? paginas : [transcrito];
        ocr = true;
      }
      const t = tramo(texto, a.desde_pagina, a.max_caracteres);
      return {
        ...base,
        ocr,
        paginas: `${t.desde}-${t.hasta} de ${t.total}`,
        hay_mas: t.hasta < t.total,
        hasta: t.hasta,
        texto: t.texto,
      };
    },
  }),

  definir({
    nombre: "perfil_empresa",
    titulo: "Perfil de la empresa oferente",
    descripcion:
      "Datos de la empresa en adjudicado.app: razón social, RNC, tasa USD/DOP y margen por defecto, firmantes por rol, " +
      "socios/vendors (lic_capability) y documentación VIGENTE (para marcar qué requisitos ya están cubiertos).",
    soloLectura: true,
    entrada: z.object({}),
    async ejecutar(_a, ctx) {
      return perfilEmpresa(ctx);
    },
  }),

  definir({
    nombre: "mis_procesos",
    titulo: "Procesos en adjudicado.app",
    descripcion: "Lista los procesos que la empresa ya trabaja en adjudicado.app (para no re-analizar), por estado.",
    soloLectura: true,
    entrada: z.object({
      estados: z.array(z.enum(ESTADOS_LICITACION as [string, ...string[]])).optional(),
    }),
    async ejecutar({ estados }, ctx) {
      const filas = await listarProcesos(ctx, estados);
      return filas.map((p) => ({ ...p, url: `${ctx.baseUrl}/licitaciones/${p.id}` }));
    },
  }),

  definir({
    nombre: "importar_proceso",
    titulo: "Llevar el análisis a la Bid Room",
    descripcion:
      "Crea (o actualiza) el proceso en adjudicado.app con el resultado del análisis: cabecera, lotes, ítems con la spec " +
      "TAL CUAL del pliego y la marca/modelo propuesta, y el checklist de requisitos (los estándar se enlazan solos a la " +
      "documentación vigente de la empresa). Lo que la DGCP ya sabe (institución, cierre, modalidad) se completa solo. " +
      "Si el proceso ya tenía ítems, no se pisan. Confirmar con el usuario antes de llamarla. Códigos estándar válidos: " +
      CODIGOS_REQUISITO.join(", "),
    soloLectura: false,
    entrada: z.object({
      codigo: codigoProceso,
      objeto: z.string().optional(),
      cierre: z.string().optional().describe("ISO 8601 con hora; por defecto el de la DGCP"),
      moneda: z.enum(["DOP", "USD"]).optional(),
      adjudicacion: z.enum(["item", "lote", "total"]).optional(),
      criterio: z.enum(["menor_precio", "calidad_precio", "calidad"]).optional(),
      plazo_pago_dias: z.number().int().nonnegative().optional(),
      resumen: z.string().optional().describe("Resumen ejecutivo y alertas: va a las notas del proceso"),
      lotes: z.array(z.object({ numero: z.number().int().positive(), nombre: z.string().optional() })).optional(),
      items: z
        .array(
          z.object({
            numero: z.number().int().positive().optional(),
            lote: z.number().int().positive().optional().describe("Número de lote, si el proceso es por lotes"),
            spec_cruda: z.string().min(1).describe("Especificación copiada TAL CUAL del pliego/ficha (evidencia legal)"),
            cantidad: z.number().positive(),
            unidad: z.string().optional(),
            marca: z.string().optional(),
            modelo: z.string().optional(),
            parte: z.string().optional().describe("Número de parte / SKU del fabricante"),
            descripcion: z
              .string()
              .optional()
              .describe(
                "Lo que se oferta, en redacción afirmativa. 1ª línea = resumen; cada línea siguiente = un punto de " +
                  "cumplimiento 'Clave: valor (req. X)' que la oferta técnica pinta con ✓. Ej.: " +
                  "'Laptop Dell Latitude 5450…\nProcesador: Intel Core Ultra 7 (req. i7 o superior)\nRAM: 16 GB (req. mín. 16 GB)'",
              ),
          }),
        )
        .optional(),
      requisitos_estandar: z
        .array(z.string())
        .optional()
        .describe("Códigos del checklist estándar que exige ESTE pliego. Incluye PROP-TEC: la oferta técnica la genera la Bid Room"),
      oferta_tecnica: z
        .object({
          validez_dias: z.string().optional().describe("Validez de la oferta, p. ej. '45'"),
          plazo_entrega: z.string().optional().describe("p. ej. '30 días calendario'"),
          lugar_entrega: z.string().optional(),
          garantia: z.string().optional().describe("Garantía ofrecida, p. ej. '1 año del fabricante'"),
        })
        .optional()
        .describe("Datos del pliego que pide la oferta técnica (PROP-TEC); lo que falte se completa en la Bid Room"),
      requisitos_extra: z
        .array(
          z.object({
            codigo: z.string().min(1),
            nombre: z.string().min(1),
            subsanable: z.boolean().describe("Ante la duda, false: un no-subsanable faltante descalifica"),
            fuente: z.string().optional().describe("Sección/página del pliego que lo exige"),
          }),
        )
        .optional(),
    }),
    async ejecutar(a, ctx) {
      const proceso = await dgcp.obtenerProceso(a.codigo).catch(() => null);
      const r = await importarProceso(ctx, a, proceso);
      return { ...r, url: `${ctx.baseUrl}/licitaciones/${r.proceso_id}` };
    },
  }),

  definir({
    nombre: "patrones_institucion",
    titulo: "Memoria de una institución",
    descripcion:
      "Lo que el equipo ha aprendido de una entidad convocante (plazos de pago reales, exigencias recurrentes, rigor al " +
      "subsanar…). `institucion` acepta siglas, nombre o un código de proceso.",
    soloLectura: true,
    entrada: z.object({ institucion: z.string().min(2) }),
    async ejecutar({ institucion }, ctx) {
      const siglas = siglasDesdeCodigo(institucion);
      const inst = await resolverInstitucion(ctx, { siglas, nombre: institucion }, false);
      if (!inst) return { institucion: null, patrones: [], aviso: "Institución no registrada todavía en adjudicado.app." };
      return { institucion: inst, patrones: await patronesDe(ctx, inst.id) };
    },
  }),

  definir({
    nombre: "guardar_patron",
    titulo: "Recordar un patrón de una institución",
    descripcion:
      "Guarda en la memoria del equipo un comportamiento RECURRENTE de una entidad que el usuario mencionó (no datos de un " +
      "solo proceso, no el tipo de cambio). Repetir la misma clave sube su confianza. Ej.: clave 'plazo_pago', nota " +
      "'Paga a 90-120 días. Origen: INESPRE-DAF-CM-2025-0012 (mar-2025)'.",
    soloLectura: false,
    entrada: z.object({
      institucion: z.string().min(2).describe("Siglas, nombre o código de un proceso de la entidad"),
      clave: z.string().min(2).describe("Tema corto: plazo_pago, carta_fabricante, rigor_subsanacion, preferencia_marca…"),
      nota: z.string().min(5).describe("La observación en 1-2 líneas, citando el proceso y la fecha de origen"),
    }),
    async ejecutar(a, ctx) {
      const siglas = siglasDesdeCodigo(a.institucion);
      let nombre: string | null = a.institucion;
      // Si dieron un código de proceso, el nombre real sale de la DGCP.
      if (/-\d{4}-\d+$/.test(a.institucion)) {
        nombre = (await dgcp.obtenerProceso(a.institucion).catch(() => null))?.unidad_compra ?? null;
      }
      const inst = await resolverInstitucion(ctx, { siglas, nombre }, true);
      if (!inst) throw new Error("No pude identificar la institución; usa su nombre completo.");
      return { institucion: inst.nombre, ...(await guardarPatron(ctx, inst.id, a)) };
    },
  }),
];
