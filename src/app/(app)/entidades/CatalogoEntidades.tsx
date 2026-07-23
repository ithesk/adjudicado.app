"use client";

// El catálogo denso de entidades con BUSCADOR instantáneo: filtra por
// nombre, siglas, RNC, teléfono o asignados, ignorando acentos y mayúsculas.

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Landmark, Search } from "lucide-react";
import { Panel } from "@/components/ui";
import { coincideTexto } from "@/lib/buscar-texto";
import type { EntidadResumen } from "@/lib/entidades/queries";

const COLS =
  "sm:grid-cols-[2.25rem_minmax(0,1fr)_9rem_5.5rem_5.5rem_minmax(0,12rem)_1rem]";

export default function CatalogoEntidades({
  entidades,
}: {
  entidades: EntidadResumen[];
}) {
  const [q, setQ] = useState("");

  const filtradas = useMemo(() => {
    if (!q.trim()) return entidades;
    return entidades.filter((e) =>
      coincideTexto(
        `${e.nombre} ${e.siglas ?? ""} ${e.rnc ?? ""} ${e.telefono ?? ""} ${e.asignados.join(" ")}`,
        q,
      ),
    );
  }, [entidades, q]);

  return (
    <div className="space-y-3">
      <label className="relative block">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          strokeWidth={2}
          aria-hidden
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar entidad por nombre, siglas, RNC o quién la atiende…"
          className="w-full rounded-md border border-line bg-surface py-2 pl-9 pr-16 text-sm text-ink shadow-card outline-none transition-colors placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-[var(--ring)]"
        />
        {q && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-muted">
            {filtradas.length}/{entidades.length}
          </span>
        )}
      </label>

      {filtradas.length === 0 ? (
        <Panel className="p-8 text-center text-sm text-muted">
          Nada coincide con “{q}”.
        </Panel>
      ) : (
        <Panel>
          <div
            className={`hidden gap-3 border-b border-line px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted sm:grid ${COLS}`}
          >
            <span />
            <span>Entidad</span>
            <span>RNC</span>
            <span className="text-right">Procesos</span>
            <span className="text-right">Órdenes</span>
            <span>La atiende</span>
            <span />
          </div>
          <ul className="divide-y divide-line">
            {filtradas.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/entidades/${e.id}`}
                  className={`group flex items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-2 sm:grid ${COLS}`}
                >
                  {e.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={e.logo}
                      alt=""
                      className="h-8 w-8 rounded-md border border-line bg-white object-contain p-0.5"
                    />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-2 text-muted">
                      <Landmark className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 sm:flex-none">
                    <span className="block truncate text-[13px] font-medium text-ink group-hover:text-primary">
                      {e.siglas ? `${e.siglas} — ` : ""}
                      {e.nombre}
                    </span>
                    {e.telefono && (
                      <span className="block truncate font-mono text-[11px] text-muted">
                        {e.telefono}
                      </span>
                    )}
                  </span>
                  <span className="hidden truncate font-mono text-[12px] text-muted sm:block">
                    {e.rnc ?? "—"}
                  </span>
                  <span className="hidden text-right font-mono text-[12px] tabular-nums text-ink-soft sm:block">
                    {e.procesos}
                  </span>
                  <span className="hidden text-right font-mono text-[12px] tabular-nums text-ink-soft sm:block">
                    {e.ordenes}
                  </span>
                  <span className="hidden min-w-0 flex-wrap gap-1 sm:flex">
                    {e.asignados.length === 0 ? (
                      <span className="text-[11.5px] text-muted">—</span>
                    ) : (
                      e.asignados.map((a) => (
                        <span
                          key={a}
                          className="truncate rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                        >
                          {a}
                        </span>
                      ))
                    )}
                  </span>
                  <ChevronRight
                    className="hidden h-3.5 w-3.5 text-muted opacity-0 transition-opacity group-hover:opacity-100 sm:block"
                    strokeWidth={2}
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
