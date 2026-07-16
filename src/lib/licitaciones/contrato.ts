// El contrato de datos del módulo de Licitaciones: la estructura canónica de
// un proceso. Es lo que consume todo lo demás (persistencia, Bid Room, motor
// documental). Ver docs/licitaciones/plan.md, Fase 1.
//
// REGLAS DURAS (no negociables):
//
// 1. `spec_cruda` es el texto TAL CUAL del pliego — evidencia legal de lo que
//    pidió la entidad. Nunca se edita, normaliza ni recorta (ni un .trim()).
//    Lo que la empresa decide ofertar vive aparte, en `producto`.
//
// 2. `subsanable` default FALSE (fail-safe): si no se sabe si un requisito se
//    puede corregir después, se trata como crítico. Un no-subsanable faltante
//    descalifica — ya pasó una vez.
//
// 3. `oferente`, `firmantes` y el cotizador de cada línea económica son
//    SNAPSHOT, no referencia viva: regenerar un paquete viejo produce el mismo
//    papel aunque mañana cambien el RNC, el firmante o la tasa del dólar.
//    Recalcular es un acto explícito del usuario, nunca implícito.
//
// 4. Los firmantes son ROLES con su persona resuelta al momento del snapshot.
//    Nunca nombres propios en enums: esto se vende a otros proveedores.
//
// Módulo puro: sin imports de servidor (se usa en cliente, servidor y tests).

import { z } from "zod";

// ---------- primitivas ----------

const fechaISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato YYYY-MM-DD");

// El cierre es EL reloj del proceso: exige fecha Y hora (una oferta que llega
// a las 10:01 de un cierre 10:00 no existe). "2026-08-01" solo → inválido.
const fechaHoraISO = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
    "Debe incluir fecha y hora (YYYY-MM-DDTHH:MM)",
  );

export const MODALIDADES = ["CM", "CD", "LPN", "CP", "SB", "OTRO"] as const;
export const ROLES_FIRMANTE = ["gerente_general", "gerente_ventas"] as const;

// ---------- bloques ----------

const Meta = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  version: z.number().int().positive(), // sube en cada generación de paquete
  generado_en: fechaHoraISO,
});

const Entidad = z.object({
  nombre: z.string().min(1),
  siglas: z.string().min(1),
  direccion: z.string().optional(),
});

const Cronograma = z.object({
  publicacion: fechaISO.optional(),
  aclaraciones: fechaISO.optional(),
  cierre: fechaHoraISO, // obligatorio, con hora — ver arriba
  apertura_tecnica: fechaHoraISO.optional(),
  apertura_economica: fechaHoraISO.optional(),
});

const Proceso = z.object({
  codigo: z.string().min(1),
  modalidad: z.enum(MODALIDADES),
  objeto: z.string().min(1),
  entidad: Entidad,
  cronograma: Cronograma,
  moneda: z.enum(["DOP", "USD"]),
  plazo_pago_dias: z.number().int().positive().optional(),
  adjudicacion: z.enum(["item", "lote", "total"]),
  criterio: z.enum(["menor_precio", "calidad_precio", "calidad"]),
});

// Snapshot de la empresa al momento de generar (regla 3).
const Oferente = z.object({
  razon_social: z.string().min(1),
  rnc: z.string().min(1),
  rpe: z.string().min(1),
  direccion: z.string().min(1),
  telefono: z.string().min(1),
  email: z.string().email(),
});

// Rol → persona, resuelto por organización al momento del snapshot (regla 4).
const Firmante = z.object({
  rol: z.enum(ROLES_FIRMANTE),
  nombre: z.string().min(1),
  cedula: z.string().optional(),
  cargo: z.string().min(1),
});

// Lo que la empresa decide ofertar para un ítem (separado de spec_cruda).
const Producto = z.object({
  marca: z.string().min(1),
  modelo: z.string().min(1),
  parte: z.string().optional(),
  // Redacción afirmativa ("El equipo incluye…"), nunca "Cumple/No cumple".
  descripcion: z.string().min(1),
});

const Item = z.object({
  numero: z.number().int().positive(),
  // Regla 1: tal cual el pliego. min(1) es la única validación admisible.
  spec_cruda: z.string().min(1),
  cantidad: z.number().positive(),
  unidad: z.string().min(1),
  producto: Producto.optional(),
  ofertamos: z.boolean(),
  motivo_descarte: z.string().optional(),
});

const Lote = z.object({
  numero: z.number().int().positive(),
  nombre: z.string().optional(),
  items: z.array(Item).min(1),
});

const Requisito = z.object({
  codigo: z.string().min(1),
  nombre: z.string().min(1),
  subsanable: z.boolean().default(false), // regla 2: ante la duda, crítico
  fuente: z.string().optional(), // dónde en el pliego se exige
  // Sin default a propósito: obligar a decidir quién firma cada requisito.
  firmante_rol: z.enum([...ROLES_FIRMANTE, "ninguno"]),
  origen: z.enum(["generado", "plantilla_oficial", "documento_empresa", "externo"]),
  estado: z.enum(["pendiente", "listo"]).default("pendiente"),
  documento_empresa_id: z.string().uuid().optional(),
  storage_path: z.string().optional(),
});

// Una línea de la oferta económica, con el cotizador CONGELADO (regla 3).
// El enlace al catálogo de Precios es (suplidor_id, sku): sobrevive las
// re-importaciones de listas. Los campos de costo son null en líneas manuales.
const LineaEconomica = z.object({
  item: z.number().int().positive(), // referencia a Item.numero
  lote: z.number().int().positive().optional(),
  suplidor_id: z.string().uuid().optional(),
  sku: z.string().optional(),
  costo_usd: z.number().positive().optional(),
  tasa: z.number().positive().optional(),
  margen_pct: z.number().nonnegative().optional(),
  margen_modo: z.enum(["markup", "margen"]).optional(),
  precio_unitario: z.number().nonnegative(), // DOP, venta, SIN ITBIS
  itbis_aplica: z.boolean(),
});

const Economico = z.object({
  itbis_pct: z.number().nonnegative().default(18),
  lineas: z.array(LineaEconomica).min(1),
});

// ---------- el contrato ----------

export const ProcesoCanonico = z
  .object({
    meta: Meta,
    proceso: Proceso,
    oferente: Oferente,
    firmantes: z.array(Firmante).min(1),
    lotes: z.array(Lote).min(1),
    requisitos: z.array(Requisito),
    economico: Economico.optional(),
  })
  .superRefine((doc, ctx) => {
    // Cada línea económica debe apuntar a un ítem que existe y se oferta.
    const ofertados = new Set(
      doc.lotes.flatMap((l) => l.items.filter((i) => i.ofertamos).map((i) => i.numero)),
    );
    doc.economico?.lineas.forEach((linea, idx) => {
      if (!ofertados.has(linea.item)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["economico", "lineas", idx, "item"],
          message: `La línea económica apunta al ítem ${linea.item}, que no existe o no se oferta`,
        });
      }
    });
    // Un ítem descartado necesita su porqué (queda en el expediente).
    doc.lotes.forEach((lote, li) =>
      lote.items.forEach((item, ii) => {
        if (!item.ofertamos && !item.motivo_descarte) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["lotes", li, "items", ii, "motivo_descarte"],
            message: "Un ítem que no se oferta debe llevar motivo_descarte",
          });
        }
      }),
    );
  });

export type ProcesoCanonico = z.infer<typeof ProcesoCanonico>;

// ---------- errores en cristiano ----------
// La validación le habla al usuario, no al programador: qué falta y DÓNDE se
// arregla ("oferente.rpe: Too small…" no le dice nada a nadie).

const CAMPO_EMPRESA: Record<string, string> = {
  razon_social: "la razón social",
  rnc: "el RNC",
  rpe: "el RPE (Registro de Proveedores del Estado)",
  direccion: "la dirección",
  telefono: "el teléfono",
  email: "el email",
};

const CAMPO_PROCESO: Record<string, string> = {
  codigo: "el código del proceso",
  objeto: "el objeto de la contratación",
  modalidad: "la modalidad",
};

export function traducirIssue(
  path: (string | number | symbol)[],
  mensaje: string,
): string {
  const [raiz, ...resto] = path.map(String);

  if (raiz === "oferente") {
    return `Falta ${CAMPO_EMPRESA[resto[0]] ?? `el dato "${resto[0]}"`} de la empresa — complétalo en Configuración → Empresa`;
  }
  if (raiz === "firmantes") {
    return resto.length === 0
      ? "Faltan los firmantes (Gerente General y de Ventas) — complétalos en Configuración → Empresa"
      : "Hay un firmante incompleto (nombre y cargo) — Configuración → Empresa";
  }
  if (raiz === "proceso") {
    if (resto.join(".").startsWith("cronograma.cierre"))
      return "Falta la fecha y HORA de cierre — estación 1 · Proceso";
    if (resto[0] === "entidad")
      return "Falta la entidad convocante — elígela o créala en 1 · Proceso";
    if (CAMPO_PROCESO[resto[0]])
      return `Falta ${CAMPO_PROCESO[resto[0]]} — estación 1 · Proceso`;
    return `Dato del proceso incompleto (${resto.join(".")}) — estación 1 · Proceso`;
  }
  if (raiz === "lotes") {
    if (resto.length === 0)
      return "No hay ítems en el expediente — cárgalos en 3 · Ítems";
    const campo = resto.at(-1);
    if (campo === "motivo_descarte")
      return "Hay un ítem descartado sin su motivo — complétalo en 3 · Ítems";
    if (campo === "spec_cruda")
      return "Hay un ítem sin la descripción del pliego — complétala en 3 · Ítems";
    return `Hay un ítem incompleto (${campo}) — revísalo en 3 · Ítems`;
  }
  if (raiz === "economico") {
    if (mensaje.includes("no existe o no se oferta")) return mensaje;
    return "Hay una línea económica incompleta o con precio inválido — revísala en 3 · Ítems";
  }
  return `${path.join(".") || "expediente"}: ${mensaje}`;
}
export type ItemCanonico = z.infer<typeof Item>;
export type RequisitoCanonico = z.infer<typeof Requisito>;
export type LineaEconomicaCanonica = z.infer<typeof LineaEconomica>;
