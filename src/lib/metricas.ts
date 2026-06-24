// Catálogo de métricas del dashboard. Cada una define un PREDICADO sobre la
// orden, así el mismo dato sirve para (1) calcular el valor (conteo o monto) y
// (2) filtrar la tabla al hacer clic. Módulo puro: usable en server y client.

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

export interface MetricaDef {
  key: string;
  label: string;
  fmt: "num" | "monto";
  predicado: (o: OrdenConItems) => boolean;
  tono?: (valor: number) => TonoMetrica;
}

const dias = (o: OrdenConItems) => diasRestantes(plazoDominante(o));

export const METRICAS: MetricaDef[] = [
  {
    key: "vivas",
    label: "Órdenes vivas",
    fmt: "num",
    predicado: (o) => esViva(o.estado),
  },
  {
    key: "pendiente_entrega",
    label: "Pendiente de entrega",
    fmt: "num",
    predicado: (o) =>
      o.estado === "orden_recibida" || o.estado === "en_coordinacion",
  },
  {
    key: "vencen_pronto",
    label: "Vencen ≤ 5 días",
    fmt: "num",
    predicado: (o) => {
      if (!esViva(o.estado)) return false;
      const n = nivelUrgencia(dias(o));
      return n === "vencido" || n === "rojo" || n === "ambar";
    },
    tono: (v) => (v > 0 ? "aviso" : undefined),
  },
  {
    key: "vencidas",
    label: "Vencidas",
    fmt: "num",
    predicado: (o) => esViva(o.estado) && (dias(o) ?? 1) < 0,
    tono: (v) => (v > 0 ? "alerta" : undefined),
  },
  {
    key: "en_libramiento",
    label: "En libramiento",
    fmt: "num",
    predicado: (o) => o.estado === "libramiento",
  },
  {
    key: "atascado",
    label: "Entregado sin facturar",
    fmt: "monto",
    predicado: (o) => estaAtascado(o.estado),
    tono: (v) => (v > 0 ? "aviso" : undefined),
  },
  {
    key: "por_cobrar",
    label: "Por cobrar",
    fmt: "monto",
    predicado: (o) => porCobrar(o.estado),
  },
  {
    key: "monto_vivo",
    label: "Monto en juego",
    fmt: "monto",
    predicado: (o) => esViva(o.estado),
  },
  {
    key: "cobrado",
    label: "Cobrado (total)",
    fmt: "monto",
    predicado: (o) => o.estado === "cobrado" || o.estado === "cerrado",
  },
];

export function metricaPorKey(key: string | undefined): MetricaDef | undefined {
  if (!key) return undefined;
  return METRICAS.find((m) => m.key === key);
}

export function valorMetrica(def: MetricaDef, ordenes: OrdenConItems[]): number {
  const m = ordenes.filter(def.predicado);
  return def.fmt === "monto"
    ? m.reduce((s, x) => s + (x.monto ?? 0), 0)
    : m.length;
}
