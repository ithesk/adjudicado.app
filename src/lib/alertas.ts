// El motor de alertas: TODO lo que pide atención en un solo lugar, sin
// importar en qué pantalla esté el usuario (la campanita del menú lo muestra
// en cualquier opción del sistema).
//
// Regla de diseño: una alerta es ESTADO DERIVADO, no un mensaje guardado. No
// se borra — se resuelve. Un RPE vencido deja de alertar cuando se sube el
// nuevo, no cuando alguien le da a «descartar». Por eso este módulo es una
// función pura sobre los datos que la app ya carga: sin tabla, sin cron, sin
// nada que se pueda desincronizar de la realidad.
//
// Módulo puro (sin imports de servidor): se usa en cliente y en servidor.

import {
  diasRestantes,
  esViva,
  estaAtascado,
  nivelUrgencia,
  plazoDominante,
  type Orden,
} from "@/lib/types";
import {
  estadoDocumentacion,
  type DocumentoEmpresa,
} from "@/lib/empresa/documentos";

// Tres niveles, no cinco: la alerta o es tarde (vencido), o es para hoy
// (urgente), o es para esta semana (aviso). Más matices no cambian qué hace
// la persona al leerlos.
export type NivelAlerta = "vencido" | "urgente" | "aviso";

export type FuenteAlerta = "documento" | "orden" | "licitacion" | "subsanacion";

export interface Alerta {
  /** Estable entre renders: identifica la alerta para marcarla como vista. */
  id: string;
  nivel: NivelAlerta;
  fuente: FuenteAlerta;
  /** Una línea, lo que se lee de un vistazo. */
  titulo: string;
  /** El porqué y el plazo, en cristiano. */
  detalle: string;
  /** A dónde ir a resolverlo. */
  href: string;
  /** Días restantes (negativo = ya pasó). null = no es cuestión de plazo. */
  dias: number | null;
}

// ---------- Cómo se dice un plazo en cristiano ----------

export function plazoEnPalabras(dias: number): string {
  if (dias < -1) return `venció hace ${Math.abs(dias)} días`;
  if (dias === -1) return "venció ayer";
  if (dias === 0) return "vence HOY";
  if (dias === 1) return "vence mañana";
  return `vencen ${dias} días`;
}

// ---------- Documentación de la empresa ----------

// Umbrales propios (los de empresa/documentos.ts): una certificación de la
// DGII o la TSS se tramita con semanas de antelación.
function nivelPorDiasDoc(dias: number): NivelAlerta {
  if (dias < 0) return "vencido";
  if (dias <= 15) return "urgente";
  return "aviso";
}

export function alertasDeDocumentos(docs: DocumentoEmpresa[]): Alerta[] {
  const alertas: Alerta[] = [];
  const filas = estadoDocumentacion(docs);

  for (const f of filas) {
    if (!f.vigente || f.dias === null) continue;
    if (f.dias > 30) continue; // todavía no es noticia
    alertas.push({
      id: `doc:${f.vigente.id}`,
      nivel: nivelPorDiasDoc(f.dias),
      fuente: "documento",
      titulo: f.tipo.label,
      detalle:
        f.dias < 0
          ? `Documento de la empresa: ${plazoEnPalabras(f.dias)}. Sin él no se puede presentar oferta.`
          : `Documento de la empresa: ${plazoEnPalabras(f.dias)}. Tramítalo con tiempo.`,
      href: "/configuracion/empresa",
      dias: f.dias,
    });
  }

  // Los que NUNCA se cargaron van AGRUPADOS: en una empresa recién montada
  // faltan cinco de golpe, y cinco alertas iguales solo hacen ruido.
  const faltantes = filas.filter((f) => f.tipo.vence && !f.vigente);
  if (faltantes.length > 0) {
    alertas.push({
      id: "doc:faltantes",
      nivel: "aviso",
      fuente: "documento",
      titulo:
        faltantes.length === 1
          ? `Falta cargar: ${faltantes[0].tipo.label}`
          : `Faltan ${faltantes.length} documentos de la empresa`,
      detalle: faltantes.map((f) => f.tipo.label).join(" · "),
      href: "/configuracion/empresa",
      dias: null,
    });
  }

  return alertas;
}

// ---------- Órdenes de compra ----------

// Días que una orden puede quedarse entregada sin facturar antes de que eso
// sea un problema: el dinero ya se gastó y todavía no se puede cobrar.
const DIAS_ATASCO = 15;

export function alertasDeOrdenes(ordenes: Orden[]): Alerta[] {
  const alertas: Alerta[] = [];

  for (const o of ordenes) {
    if (!esViva(o.estado)) continue;
    const nombre = o.numero_oc ? `OC ${o.numero_oc}` : "Orden sin número";
    const donde = o.institucion ? ` — ${o.institucion}` : "";

    // 1) El plazo que manda en su estado (entrega o cobro).
    const dias = diasRestantes(plazoDominante(o));
    const nivel = nivelUrgencia(dias);
    if (dias !== null && (nivel === "vencido" || nivel === "rojo" || nivel === "ambar")) {
      alertas.push({
        id: `orden:plazo:${o.id}`,
        nivel: nivel === "vencido" ? "vencido" : nivel === "rojo" ? "urgente" : "aviso",
        fuente: "orden",
        titulo: `${nombre}${donde}`,
        detalle: `Plazo de entrega: ${plazoEnPalabras(dias)}.`,
        href: `/orden/${o.id}`,
        dias,
      });
    }

    // 2) Entregado y sin facturar: trabajo hecho que nadie ha cobrado.
    if (estaAtascado(o.estado)) {
      const quieto = Math.floor(
        (Date.now() - new Date(o.updated_at).getTime()) / 86_400_000,
      );
      if (quieto >= DIAS_ATASCO) {
        alertas.push({
          id: `orden:atasco:${o.id}`,
          nivel: "aviso",
          fuente: "orden",
          titulo: `${nombre}${donde}`,
          detalle: `Entregada sin facturar hace ${quieto} días — pendiente de facturar para poder cobrar.`,
          href: `/orden/${o.id}`,
          dias: null,
        });
      }
    }
  }

  return alertas;
}

// ---------- Licitaciones ----------

// Lo que el motor necesita saber de un proceso. Tipo PROPIO y estrecho: así
// las consultas pueden cambiar de forma sin arrastrar este módulo.
export interface ProcesoParaAlerta {
  id: string;
  codigo: string;
  estado: string;
  /** Fecha de cierre de recepción de ofertas (YYYY-MM-DD). */
  cierre: string | null;
  institucion: string | null;
  /** Fecha límite de la subsanación ABIERTA de este proceso, si la hay. */
  subsanacionLimite: string | null;
}

// Estados en los que el cierre todavía importa: aún estamos armando la
// oferta. Sometido/adjudicado/perdido/descartado ya no corren contra reloj.
const ESTADOS_ANTES_DE_SOMETER = [
  "captura",
  "calificacion",
  "costeo",
  "armado",
  "listo",
];

export function alertasDeLicitaciones(procesos: ProcesoParaAlerta[]): Alerta[] {
  const alertas: Alerta[] = [];

  for (const p of procesos) {
    const nombre = `${p.codigo}${p.institucion ? ` — ${p.institucion}` : ""}`;

    // 1) El cierre del proceso, mientras la oferta no esté presentada.
    if (p.cierre && ESTADOS_ANTES_DE_SOMETER.includes(p.estado)) {
      const dias = diasRestantes(p.cierre);
      if (dias !== null && dias <= 5) {
        alertas.push({
          id: `lic:cierre:${p.id}`,
          nivel: dias < 0 ? "vencido" : dias <= 2 ? "urgente" : "aviso",
          fuente: "licitacion",
          titulo: nombre,
          detalle:
            dias < 0
              ? `El cierre ${plazoEnPalabras(dias)} y la oferta no se marcó como sometida.`
              : `Cierre de la licitación: ${plazoEnPalabras(dias)}. El paquete tiene que estar listo antes.`,
          href: `/licitaciones/${p.id}`,
          dias,
        });
      }
    }

    // 2) La subsanación: plazo corto y fatal. Se avisa siempre que esté
    //    abierta, aunque falte una semana — perder una subsanación por olvido
    //    es perder una licitación que en papel ya estaba ganada.
    if (p.subsanacionLimite) {
      // La fecha límite lleva hora (vence a las 3:00 pm de ese día); para
      // contar días basta el día.
      const dias = diasRestantes(p.subsanacionLimite.slice(0, 10));
      if (dias !== null) {
        alertas.push({
          id: `sub:${p.id}`,
          nivel: dias < 0 ? "vencido" : dias <= 1 ? "urgente" : "aviso",
          fuente: "subsanacion",
          titulo: `Subsanación · ${nombre}`,
          detalle:
            dias < 0
              ? `El plazo de la subsanación ${plazoEnPalabras(dias)} y no se marcó como enviada.`
              : `La entidad pidió corregir documentos: ${plazoEnPalabras(dias)}.`,
          href: `/licitaciones/${p.id}`,
          dias,
        });
      }
    }
  }

  return alertas;
}

// ---------- El conjunto ----------

const PESO: Record<NivelAlerta, number> = { vencido: 0, urgente: 1, aviso: 2 };

// Lo más grave primero y, dentro del mismo nivel, lo que menos tiempo tiene.
// Las que no son de plazo (faltantes, atascos) van al final de su grupo.
export function ordenarAlertas(alertas: Alerta[]): Alerta[] {
  return [...alertas].sort((a, b) => {
    if (a.nivel !== b.nivel) return PESO[a.nivel] - PESO[b.nivel];
    if (a.dias === null) return b.dias === null ? 0 : 1;
    if (b.dias === null) return -1;
    return a.dias - b.dias;
  });
}

export interface FuentesAlerta {
  docs?: DocumentoEmpresa[];
  ordenes?: Orden[];
  procesos?: ProcesoParaAlerta[];
}

export function construirAlertas(fuentes: FuentesAlerta): Alerta[] {
  return ordenarAlertas([
    ...alertasDeDocumentos(fuentes.docs ?? []),
    ...alertasDeOrdenes(fuentes.ordenes ?? []),
    ...alertasDeLicitaciones(fuentes.procesos ?? []),
  ]);
}

export interface ResumenAlertas {
  total: number;
  vencidas: number;
  urgentes: number;
  /** Hay algo vencido o para hoy: la campanita se pinta de rojo. */
  grave: boolean;
}

export function resumirAlertas(alertas: Alerta[]): ResumenAlertas {
  const vencidas = alertas.filter((a) => a.nivel === "vencido").length;
  const urgentes = alertas.filter((a) => a.nivel === "urgente").length;
  return {
    total: alertas.length,
    vencidas,
    urgentes,
    grave: vencidas + urgentes > 0,
  };
}

export const NIVEL_ALERTA_LABEL: Record<NivelAlerta, string> = {
  vencido: "Vencido",
  urgente: "Urgente",
  aviso: "Por vencer",
};

export const FUENTE_ALERTA_LABEL: Record<FuenteAlerta, string> = {
  documento: "Documentación",
  orden: "Órdenes",
  licitacion: "Licitaciones",
  subsanacion: "Subsanaciones",
};
