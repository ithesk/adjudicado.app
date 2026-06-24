"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  diasRestantes,
  esViva,
  estaAtascado,
  formatRD,
  nivelUrgencia,
  plazoDominante,
  porCobrar,
} from "@/lib/types";
import type { OrdenConItems } from "@/lib/queries";

type Fmt = "num" | "monto";
type Tono = "alerta" | "aviso" | undefined;

interface MetricaDef {
  key: string;
  label: string;
  fmt: Fmt;
  calc: (o: OrdenConItems[]) => number;
  tono?: (v: number) => Tono;
}

const dias = (o: OrdenConItems) => diasRestantes(plazoDominante(o));
const sumaMonto = (o: OrdenConItems[]) => o.reduce((s, x) => s + (x.monto ?? 0), 0);

// Catálogo de métricas disponibles. El usuario elige cuáles ver.
const CATALOGO: MetricaDef[] = [
  {
    key: "vivas",
    label: "Órdenes vivas",
    fmt: "num",
    calc: (o) => o.filter((x) => esViva(x.estado)).length,
  },
  {
    key: "pendiente_entrega",
    label: "Pendiente de entrega",
    fmt: "num",
    calc: (o) =>
      o.filter(
        (x) => x.estado === "orden_recibida" || x.estado === "en_coordinacion",
      ).length,
  },
  {
    key: "vencen_pronto",
    label: "Vencen ≤ 5 días",
    fmt: "num",
    calc: (o) =>
      o.filter((x) => {
        if (!esViva(x.estado)) return false;
        const n = nivelUrgencia(dias(x));
        return n === "vencido" || n === "rojo" || n === "ambar";
      }).length,
    tono: (v) => (v > 0 ? "aviso" : undefined),
  },
  {
    key: "vencidas",
    label: "Vencidas",
    fmt: "num",
    calc: (o) =>
      o.filter((x) => esViva(x.estado) && (dias(x) ?? 1) < 0).length,
    tono: (v) => (v > 0 ? "alerta" : undefined),
  },
  {
    key: "en_libramiento",
    label: "En libramiento",
    fmt: "num",
    calc: (o) => o.filter((x) => x.estado === "libramiento").length,
  },
  {
    key: "atascado",
    label: "Entregado sin facturar",
    fmt: "monto",
    calc: (o) => sumaMonto(o.filter((x) => estaAtascado(x.estado))),
    tono: (v) => (v > 0 ? "aviso" : undefined),
  },
  {
    key: "por_cobrar",
    label: "Por cobrar",
    fmt: "monto",
    calc: (o) => sumaMonto(o.filter((x) => porCobrar(x.estado))),
  },
  {
    key: "monto_vivo",
    label: "Monto en juego",
    fmt: "monto",
    calc: (o) => sumaMonto(o.filter((x) => esViva(x.estado))),
  },
  {
    key: "cobrado",
    label: "Cobrado (total)",
    fmt: "monto",
    calc: (o) =>
      sumaMonto(o.filter((x) => x.estado === "cobrado" || x.estado === "cerrado")),
  },
];

const STORAGE_KEY = "dashboard-metricas-v1";
const POR_DEFECTO = ["vivas", "pendiente_entrega", "vencen_pronto", "por_cobrar"];

export default function MetricBar({ ordenes }: { ordenes: OrdenConItems[] }) {
  const [visibles, setVisibles] = useState<string[]>(POR_DEFECTO);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as string[];
        const validas = saved.filter((k) => CATALOGO.some((c) => c.key === k));
        if (validas.length) setVisibles(validas);
      }
    } catch {
      /* noop */
    }
  }, []);

  function toggle(key: string) {
    setVisibles((prev) => {
      const next = prev.includes(key)
        ? prev.filter((k) => k !== key)
        : [...prev, key];
      const final = next.length ? next : prev; // no permitir dejar 0
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(final));
      } catch {
        /* noop */
      }
      return final;
    });
  }

  // Mantén el orden del catálogo.
  const elegidas = CATALOGO.filter((c) => visibles.includes(c.key));
  const cols =
    elegidas.length >= 4 ? "sm:grid-cols-4" : elegidas.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";

  return (
    <div className="space-y-1.5">
      <div className="flex justify-end">
        <details className="relative">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium text-muted transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-[var(--ring)] [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Configurar
          </summary>
          <div className="absolute right-0 z-20 mt-1 w-60 rounded-md border border-line bg-surface p-1 shadow-raised">
            <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted">
              Métricas del dashboard
            </p>
            {CATALOGO.map((c) => {
              const on = visibles.includes(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggle(c.key)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-surface-2"
                >
                  <span
                    className={`grid h-3.5 w-3.5 place-items-center rounded-sm border ${
                      on ? "border-primary bg-primary text-primary-ink" : "border-line-strong"
                    }`}
                  >
                    {on && (
                      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
                        <path
                          d="M2.5 6.2l2.2 2.2 4.8-4.8"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  {c.label}
                </button>
              );
            })}
          </div>
        </details>
      </div>

      <dl
        className={`grid grid-cols-2 divide-x divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface shadow-card sm:divide-y-0 ${cols}`}
      >
        {elegidas.map((c) => {
          const v = c.calc(ordenes);
          return (
            <Metrica
              key={c.key}
              label={c.label}
              valor={c.fmt === "monto" ? formatRD(v) : String(v)}
              tono={c.tono?.(v)}
            />
          );
        })}
      </dl>
    </div>
  );
}

function Metrica({
  label,
  valor,
  tono,
}: {
  label: string;
  valor: string;
  tono?: Tono;
}) {
  const color =
    tono === "alerta" ? "text-danger" : tono === "aviso" ? "text-warn" : "text-ink";
  const dot =
    tono === "alerta" ? "bg-danger" : tono === "aviso" ? "bg-warn" : null;
  return (
    <div className="px-4 py-3.5">
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
        {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />}
        <span className="truncate" title={label}>
          {label}
        </span>
      </dt>
      <dd
        className={`mt-1 font-mono text-xl font-semibold tracking-tight tabular-nums ${color}`}
      >
        {valor}
      </dd>
    </div>
  );
}
