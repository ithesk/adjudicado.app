// Catálogo de métricas del dashboard. Cada una define un PREDICADO sobre la
// orden, así el mismo dato sirve para (1) calcular el valor y (2) filtrar la
// tabla al hacer clic. Módulo puro: usable en server y client.
//
// Cada métrica tiene SIEMPRE las dos lecturas —cuántas órdenes y cuánto
// dinero— y `principal` solo decide cuál va en grande. Antes «En
// libramiento» era un conteo a secas y no había forma de saber cuánto
// dinero estaba ahí sin sumar la tabla a mano.

import {
  diasRestantes,
  esViva,
  estaAtascado,
  nivelUrgencia,
  plazoDominante,
  porCobrar,
} from "@/lib/types";
import type { OrdenConItems } from "@/lib/queries";

export type TonoMetrica = "alerta" | "aviso" | undefined;

export interface ValorMetrica {
  n: number;
  monto: number;
}

export interface MetricaDef {
  key: string;
  label: string;
  // Qué lectura va en grande; la otra acompaña en pequeño.
  principal: "num" | "monto";
  predicado: (o: OrdenConItems) => boolean;
  tono?: (valor: ValorMetrica) => TonoMetrica;
}

const dias = (o: OrdenConItems) => diasRestantes(plazoDominante(o));

export const METRICAS: MetricaDef[] = [
  {
    key: "vivas",
    label: "Órdenes vivas",
    principal: "num",
    predicado: (o) => esViva(o.estado),
  },
  {
    key: "pendiente_entrega",
    label: "Pendiente de entrega",
    principal: "num",
    predicado: (o) =>
      o.estado === "orden_recibida" || o.estado === "en_coordinacion",
  },
  {
    key: "vencen_pronto",
    label: "Vencen ≤ 5 días",
    principal: "num",
    predicado: (o) => {
      if (!esViva(o.estado)) return false;
      const n = nivelUrgencia(dias(o));
      return n === "vencido" || n === "rojo" || n === "ambar";
    },
    tono: (v) => (v.n > 0 ? "aviso" : undefined),
  },
  {
    key: "vencidas",
    label: "Vencidas",
    principal: "num",
    predicado: (o) => esViva(o.estado) && (dias(o) ?? 1) < 0,
    tono: (v) => (v.n > 0 ? "alerta" : undefined),
  },
  {
    key: "atascado",
    label: "Entregado sin facturar",
    principal: "monto",
    predicado: (o) => estaAtascado(o.estado),
    tono: (v) => (v.n > 0 ? "aviso" : undefined),
  },
  {
    key: "facturado",
    label: "Facturado, sin libramiento",
    principal: "monto",
    predicado: (o) => o.estado === "facturado",
  },
  {
    key: "en_libramiento",
    label: "En libramiento",
    principal: "monto",
    predicado: (o) => o.estado === "libramiento",
  },
  {
    key: "por_cobrar",
    label: "Por cobrar",
    principal: "monto",
    predicado: (o) => porCobrar(o.estado),
  },
  {
    key: "monto_vivo",
    label: "Monto en juego",
    principal: "monto",
    predicado: (o) => esViva(o.estado),
  },
  {
    key: "cobrado",
    label: "Cobrado (total)",
    principal: "monto",
    predicado: (o) => o.estado === "cobrado" || o.estado === "cerrado",
  },
];

export function metricaPorKey(key: string | undefined): MetricaDef | undefined {
  if (!key) return undefined;
  return METRICAS.find((m) => m.key === key);
}

export function valorMetrica(def: MetricaDef, ordenes: OrdenConItems[]): ValorMetrica {
  const m = ordenes.filter(def.predicado);
  return {
    n: m.length,
    monto: m.reduce((s, x) => s + (x.monto ?? 0), 0),
  };
}
