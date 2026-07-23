"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { formatRD } from "@/lib/types";
import { METRICAS, valorMetrica, type TonoMetrica } from "@/lib/metricas";
import type { OrdenConItems } from "@/lib/queries";

const STORAGE_KEY = "dashboard-metricas-v1";
const POR_DEFECTO = ["vivas", "pendiente_entrega", "vencen_pronto", "por_cobrar"];

export default function MetricBar({ ordenes }: { ordenes: OrdenConItems[] }) {
  const [visibles, setVisibles] = useState<string[]>(POR_DEFECTO);
  const sp = useSearchParams();
  const filtroActivo = sp.get("filtro");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as string[];
        const validas = saved.filter((k) => METRICAS.some((c) => c.key === k));
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

  const elegidas = METRICAS.filter((c) => visibles.includes(c.key));
  const cols =
    elegidas.length >= 4
      ? "sm:grid-cols-4"
      : elegidas.length === 3
        ? "sm:grid-cols-3"
        : "sm:grid-cols-2";

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
            {METRICAS.map((c) => {
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
          const v = valorMetrica(c, ordenes);
          const activo = filtroActivo === c.key;
          return (
            <Metrica
              key={c.key}
              href={activo ? "/" : `/?filtro=${c.key}`}
              label={c.label}
              valor={c.fmt === "monto" ? formatRD(v) : String(v)}
              tono={c.tono?.(v)}
              activo={activo}
            />
          );
        })}
      </dl>
    </div>
  );
}

function Metrica({
  href,
  label,
  valor,
  tono,
  activo,
}: {
  href: string;
  label: string;
  valor: string;
  tono?: TonoMetrica;
  activo: boolean;
}) {
  const color =
    tono === "alerta" ? "text-danger" : tono === "aviso" ? "text-warn" : "text-ink";
  const dot =
    tono === "alerta" ? "bg-danger" : tono === "aviso" ? "bg-warn" : null;
  return (
    <Link
      href={href}
      title={activo ? "Quitar filtro" : `Filtrar: ${label}`}
      className={`block px-4 py-3.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] ${
        activo ? "bg-primary/5 ring-1 ring-inset ring-primary" : "hover:bg-surface-2"
      }`}
    >
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
        {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />}
        <span className="truncate" title={label}>
          {label}
        </span>
      </dt>
      <dd
        className={`mt-1 truncate font-mono text-lg font-semibold tracking-tight tabular-nums sm:text-xl ${color}`}
      >
        {valor}
      </dd>
    </Link>
  );
}
