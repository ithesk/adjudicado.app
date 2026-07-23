"use client";

// La lista de licitaciones como TABLA INTELIGENTE (patrón del catálogo de
// entidades): buscador tolerante (mayúsculas/acentos/faltas dan igual),
// filtros por etapa con conteos, orden por columna, y la entidad visible
// en cada fila. El reloj de una subsanación abierta manda sobre el cierre.

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { diasRestantes, nivelUrgencia } from "@/lib/types";
import { urgenciaChip, urgenciaDot, textoDias } from "@/lib/ui";
import { coincideTexto } from "@/lib/buscar-texto";
import {
  ESTADO_LIC_CHIP,
  ESTADO_LIC_LABEL,
  ESTADOS_LICITACION,
  MODALIDAD_LABEL,
  type EstadoLicitacion,
  type LicProceso,
} from "@/lib/licitaciones/tipos";

// El cierre es fecha+hora; el contador de días reusa los helpers del tablero.
function diasAlCierre(cierre: string | null): number | null {
  return diasRestantes(cierre ? cierre.slice(0, 10) : null);
}

const VIVO: Record<string, boolean> = {
  captura: true,
  calificacion: true,
  costeo: true,
  armado: true,
  listo: true,
  sometido: true,
  subsanacion: true,
};

// Filtros por etapa del ciclo (con conteo, estilo Odoo).
const FILTROS: { key: string; label: string; estados: EstadoLicitacion[] | null }[] = [
  { key: "todas", label: "Todas", estados: null },
  { key: "trabajo", label: "En trabajo", estados: ["captura", "calificacion", "costeo", "armado", "listo"] },
  { key: "sometidas", label: "Sometidas", estados: ["sometido", "subsanacion"] },
  { key: "ganadas", label: "Adjudicadas", estados: ["adjudicado"] },
  { key: "cerradas", label: "Perdidas y descartadas", estados: ["perdido", "descartado"] },
];

type Orden = { col: "cierre" | "codigo" | "estado"; asc: boolean };

interface EntidadMini {
  nombre: string;
  siglas: string | null;
}

// Cabecera ordenable. Definida FUERA del padre (regla de la casa).
function Cabecera({
  col,
  orden,
  onOrdenar,
  children,
}: {
  col: Orden["col"];
  orden: Orden;
  onOrdenar: (col: Orden["col"]) => void;
  children: React.ReactNode;
}) {
  const activa = orden.col === col;
  const Flecha = orden.asc ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onOrdenar(col)}
      className={`inline-flex items-center gap-1 font-medium uppercase tracking-[0.1em] transition-colors hover:text-ink ${activa ? "text-ink" : ""}`}
      title="Ordenar por esta columna"
    >
      {children}
      {activa && <Flecha className="h-3 w-3" strokeWidth={2.2} aria-hidden />}
    </button>
  );
}

export default function ProcesosLista({
  procesos,
  subsanaciones = {},
  entidades = {},
}: {
  procesos: LicProceso[];
  // proceso_id → fecha límite de su subsanación ABIERTA: ese reloj manda.
  subsanaciones?: Record<string, string>;
  entidades?: Record<string, EntidadMini>;
}) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [orden, setOrden] = useState<Orden>({ col: "cierre", asc: true });

  const conteos = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of FILTROS) {
      m.set(
        f.key,
        f.estados === null
          ? procesos.length
          : procesos.filter((p) => f.estados!.includes(p.estado)).length,
      );
    }
    return m;
  }, [procesos]);

  const filtrados = useMemo(() => {
    const estadosDelFiltro = FILTROS.find((f) => f.key === filtro)?.estados ?? null;
    let lista = estadosDelFiltro
      ? procesos.filter((p) => estadosDelFiltro.includes(p.estado))
      : [...procesos];

    if (q.trim()) {
      lista = lista.filter((p) => {
        const ent = p.institucion_id ? entidades[p.institucion_id] : null;
        return coincideTexto(
          `${p.codigo} ${p.objeto ?? ""} ${ent?.nombre ?? ""} ${ent?.siglas ?? ""} ${MODALIDAD_LABEL[p.modalidad] ?? p.modalidad} ${ESTADO_LIC_LABEL[p.estado]}`,
          q,
        );
      });
    }

    const dir = orden.asc ? 1 : -1;
    lista.sort((a, b) => {
      if (orden.col === "codigo") return dir * a.codigo.localeCompare(b.codigo);
      if (orden.col === "estado")
        return (
          dir *
          (ESTADOS_LICITACION.indexOf(a.estado) - ESTADOS_LICITACION.indexOf(b.estado))
        );
      // cierre: manda el reloj vivo (subsanación primero); sin fecha, al final.
      const da = subsanaciones[a.id]
        ? diasAlCierre(subsanaciones[a.id])
        : VIVO[a.estado]
          ? diasAlCierre(a.cierre)
          : null;
      const db = subsanaciones[b.id]
        ? diasAlCierre(subsanaciones[b.id])
        : VIVO[b.estado]
          ? diasAlCierre(b.cierre)
          : null;
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return dir * (da - db);
    });
    return lista;
  }, [procesos, q, filtro, orden, subsanaciones, entidades]);

  function ordenarPor(col: Orden["col"]) {
    setOrden((prev) =>
      prev.col === col ? { col, asc: !prev.asc } : { col, asc: true },
    );
  }

  if (procesos.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
        Crea el primer proceso con «Nuevo proceso»: código del expediente,
        entidad y fecha de cierre. Los ítems y requisitos se cargan después.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Buscador + filtros por etapa */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative block min-w-64 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            strokeWidth={2}
            aria-hidden
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por código, objeto, entidad, modalidad o estado…"
            className="w-full rounded-md border border-line bg-surface py-2 pl-9 pr-16 text-sm text-ink shadow-card outline-none transition-colors placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-[var(--ring)]"
          />
          {q && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-muted">
              {filtrados.length}/{procesos.length}
            </span>
          )}
        </label>
        <div className="flex flex-wrap gap-1">
          {FILTROS.map((f) => {
            const nf = conteos.get(f.key) ?? 0;
            if (f.key !== "todas" && nf === 0) return null;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFiltro(f.key)}
                className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-[12.5px] font-medium transition-colors ${
                  filtro === f.key
                    ? "bg-surface-2 text-ink"
                    : "text-muted hover:text-ink"
                }`}
              >
                {f.label}
                <span className="font-mono text-[10.5px] text-muted">{nf}</span>
              </button>
            );
          })}
        </div>
      </div>

      {filtrados.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
          Nada coincide{q ? ` con “${q}”` : ""} en este filtro.
        </p>
      ) : (
        // overflow-x-auto (NO hidden): en móvil las columnas fijas clipaban
        // Modalidad y Estado sin manera de verlos. Modalidad además se oculta
        // en pantallas chicas (como hace la bandeja). En desktop nada cambia.
        <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                <th className="w-[120px] px-3 py-2 font-medium">
                  <Cabecera col="cierre" orden={orden} onOrdenar={ordenarPor}>Cierre</Cabecera>
                </th>
                <th className="px-3 py-2 font-medium">
                  <Cabecera col="codigo" orden={orden} onOrdenar={ordenarPor}>Proceso</Cabecera>
                </th>
                <th className="hidden w-[150px] px-3 py-2 font-medium md:table-cell">Modalidad</th>
                <th className="w-[130px] px-3 py-2 font-medium">
                  <Cabecera col="estado" orden={orden} onOrdenar={ordenarPor}>Estado</Cabecera>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => {
                const sub = subsanaciones[p.id] ?? null;
                const dias = sub
                  ? diasAlCierre(sub)
                  : VIVO[p.estado]
                    ? diasAlCierre(p.cierre)
                    : null;
                const nivel = nivelUrgencia(dias);
                const ent = p.institucion_id ? entidades[p.institucion_id] : null;
                return (
                  <tr key={p.id} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${urgenciaDot(nivel)}`} aria-hidden />
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-xs font-medium ${urgenciaChip(nivel)}`}
                          title={sub ? "Fecha límite de la subsanación abierta" : undefined}
                        >
                          {sub || VIVO[p.estado] ? textoDias(dias) : "—"}
                        </span>
                        {sub && (
                          <span className="rounded bg-warn-soft px-1 py-0.5 text-[9.5px] font-semibold uppercase text-warn">
                            subsana
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/licitaciones/${p.id}`} prefetch={false} className="block">
                        <span className="font-mono text-xs font-medium text-ink">{p.codigo}</span>
                        <span className="block truncate text-[12.5px] text-muted">
                          {ent ? `${ent.siglas ?? ent.nombre} · ` : ""}
                          {p.objeto ?? "Sin objeto"}
                        </span>
                      </Link>
                    </td>
                    <td className="hidden px-3 py-2.5 text-[12.5px] text-ink-soft md:table-cell">
                      {MODALIDAD_LABEL[p.modalidad] ?? p.modalidad}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-medium ${ESTADO_LIC_CHIP[p.estado].chip}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${ESTADO_LIC_CHIP[p.estado].dot}`}
                          aria-hidden
                        />
                        {ESTADO_LIC_LABEL[p.estado]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
