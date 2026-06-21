"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  FileText,
  FileCheck2,
  Receipt,
  FileSignature,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { formatFecha } from "@/lib/types";
import type { DocumentoGlobal } from "@/lib/queries";

const TIPO: Record<string, { label: string; icon: LucideIcon }> = {
  oc: { label: "OC", icon: FileSignature },
  acta: { label: "Acta", icon: FileCheck2 },
  factura: { label: "Factura", icon: Receipt },
  carta_fabricante: { label: "Carta fabricante", icon: FileText },
  otro: { label: "Otro", icon: FileText },
};

function meta(tipo: string) {
  return TIPO[tipo] ?? TIPO.otro;
}

export default function DocumentosBuscador({
  docs,
}: {
  docs: DocumentoGlobal[];
}) {
  const [query, setQuery] = useState("");
  const [tipo, setTipo] = useState<string>("todos");
  const [institucion, setInstitucion] = useState<string>("todas");

  const instituciones = useMemo(
    () =>
      Array.from(
        new Set(docs.map((d) => d.institucion).filter(Boolean) as string[]),
      ).sort(),
    [docs],
  );

  const tipos = useMemo(
    () => Array.from(new Set(docs.map((d) => d.tipo))),
    [docs],
  );

  const resultados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (tipo !== "todos" && d.tipo !== tipo) return false;
      if (institucion !== "todas" && d.institucion !== institucion) return false;
      if (!q) return true;
      return [d.nombre, d.numeroOc, d.institucion, meta(d.tipo).label]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [docs, query, tipo, institucion]);

  return (
    <div className="space-y-4">
      {/* Buscador grande */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          strokeWidth={2}
          aria-hidden
        />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar un documento por nombre, OC o institución…"
          className="w-full rounded-lg border border-line bg-surface py-2.5 pl-11 pr-3 text-sm text-ink shadow-card outline-none placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-[var(--ring)]"
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          <Chip activo={tipo === "todos"} onClick={() => setTipo("todos")}>
            Todos
          </Chip>
          {tipos.map((t) => (
            <Chip key={t} activo={tipo === t} onClick={() => setTipo(t)}>
              {meta(t).label}
            </Chip>
          ))}
        </div>
        <select
          value={institucion}
          onChange={(e) => setInstitucion(e.target.value)}
          className="ml-auto rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink-soft outline-none focus:border-primary"
        >
          <option value="todas">Todas las instituciones</option>
          {instituciones.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </div>

      {/* Resultados */}
      <p className="text-[12px] text-muted">
        {resultados.length}{" "}
        {resultados.length === 1 ? "documento" : "documentos"}
      </p>

      <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
        <ul className="divide-y divide-line">
          {resultados.map((d) => {
            const m = meta(d.tipo);
            const Icon = m.icon;
            return (
              <li
                key={d.id}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2"
              >
                <span className="grid h-9 w-9 flex-none place-items-center rounded-md bg-surface-2 text-muted">
                  <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink">
                    {d.nombre}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                    <span className="rounded bg-surface-2 px-1.5 py-px font-medium">
                      {m.label}
                    </span>
                    {d.institucion && <span>{d.institucion}</span>}
                    {d.numeroOc && (
                      <span className="font-mono">{d.numeroOc}</span>
                    )}
                    <span>· {formatFecha(d.created_at.slice(0, 10))}</span>
                  </p>
                </div>
                <Link
                  href={`/orden/${d.orden_id}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
                >
                  Abrir orden
                  <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                </Link>
              </li>
            );
          })}
          {resultados.length === 0 && (
            <li className="px-4 py-10 text-center text-[13px] text-muted">
              Nada coincide con tu búsqueda.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        activo
          ? "bg-primary/10 text-primary"
          : "border border-line text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
