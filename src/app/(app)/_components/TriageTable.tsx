"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Columns3,
  Search,
  UserCheck,
  Clock,
} from "lucide-react";
import { Avatar } from "@/components/ui";
import type { ItemResumen } from "@/lib/queries";
import {
  diasRestantes,
  ESTADO_LABEL,
  ESTADOS,
  formatRD,
  nivelUrgencia,
  plazoDominante,
} from "@/lib/types";
import { estadoChip, textoDias, urgenciaChip, urgenciaDot } from "@/lib/ui";
import type { OrdenConItems } from "@/lib/queries";

type ColKey =
  | "plazo"
  | "oc"
  | "responsable"
  | "institucion"
  | "estado"
  | "items"
  | "suplidor"
  | "monto";

interface ColDef {
  key: ColKey;
  label: string;
  alwaysOn?: boolean;
  defaultOn?: boolean;
  align?: "right" | "center";
  width?: string;
  sort: (o: OrdenConItems) => number | string;
}

const COLS: ColDef[] = [
  {
    key: "plazo",
    label: "Plazo",
    alwaysOn: true,
    width: "w-28",
    sort: (o) => diasRestantes(plazoDominante(o)) ?? Number.MAX_SAFE_INTEGER,
  },
  { key: "oc", label: "Orden", alwaysOn: true, sort: (o) => o.numero_oc ?? "" },
  {
    key: "responsable",
    label: "Responsable",
    defaultOn: true,
    width: "w-40",
    sort: (o) => o.responsable?.nombre ?? "￿",
  },
  {
    key: "institucion",
    label: "Institución",
    defaultOn: true,
    sort: (o) => o.institucion ?? "",
  },
  {
    key: "estado",
    label: "Estado",
    defaultOn: true,
    sort: (o) => ESTADOS.indexOf(o.estado),
  },
  {
    key: "items",
    label: "Ítems",
    defaultOn: true,
    align: "center",
    width: "w-28",
    sort: (o) =>
      o.item.length ? o.item.filter((i) => i.entregado).length / o.item.length : -1,
  },
  {
    key: "suplidor",
    label: "Suplidores",
    defaultOn: false,
    sort: (o) => suplidoresDistintos(o).length,
  },
  {
    key: "monto",
    label: "Monto",
    alwaysOn: true,
    align: "right",
    width: "w-36",
    sort: (o) => o.monto ?? 0,
  },
];

const STORAGE_KEY = "triage-cols-v3";
const DEFAULT_VISIBLE = COLS.filter((c) => c.alwaysOn || c.defaultOn).map(
  (c) => c.key,
);

export default function TriageTable({
  ordenes,
  apagado = false,
  controls = false,
  currentUserId,
}: {
  ordenes: OrdenConItems[];
  apagado?: boolean;
  controls?: boolean;
  currentUserId?: string;
}) {
  const [visible, setVisible] = useState<ColKey[]>(DEFAULT_VISIBLE);
  const [sortKey, setSortKey] = useState<ColKey>("plazo");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [query, setQuery] = useState("");
  const [misOrdenes, setMisOrdenes] = useState(false);

  // Cargar preferencia de columnas (persistida).
  useEffect(() => {
    if (!controls) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as ColKey[];
        setVisible(
          COLS.filter((c) => c.alwaysOn || saved.includes(c.key)).map(
            (c) => c.key,
          ),
        );
      }
    } catch {
      /* noop */
    }
  }, [controls]);

  function toggleCol(key: ColKey) {
    setVisible((prev) => {
      const next = prev.includes(key)
        ? prev.filter((k) => k !== key)
        : [...prev, key];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* noop */
      }
      return next;
    });
  }

  function sortBy(key: ColKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const cols = COLS.filter((c) => visible.includes(c.key));

  const filas = useMemo(() => {
    const q = query.trim().toLowerCase();
    const def = COLS.find((c) => c.key === sortKey)!;
    const list = ordenes.filter((o) => {
      if (misOrdenes && currentUserId && o.responsable?.id !== currentUserId)
        return false;
      if (!q) return true;
      return [o.numero_oc, o.institucion, o.suplidor, o.responsable?.nombre, ...o.etiquetas]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
    const sorted = [...list].sort((a, b) => {
      const va = def.sort(a);
      const vb = def.sort(b);
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "es");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [ordenes, query, sortKey, sortDir, misOrdenes, currentUserId]);

  return (
    <div className="space-y-2">
      {controls && (
        <div className="flex items-center justify-between gap-2">
          <label className="relative flex max-w-xs flex-1 items-center">
            <Search
              className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted"
              strokeWidth={2}
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrar por OC, institución, suplidor…"
              className="w-full rounded-md border border-line bg-surface py-1.5 pl-8 pr-3 text-[13px] text-ink shadow-card outline-none placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-[var(--ring)]"
            />
          </label>

          <div className="flex items-center gap-2">
          {currentUserId && (
            <button
              type="button"
              onClick={() => setMisOrdenes((v) => !v)}
              aria-pressed={misOrdenes}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[13px] font-medium shadow-card transition-colors ${
                misOrdenes
                  ? "border-primary bg-primary text-primary-ink"
                  : "border-line bg-surface text-ink-soft hover:text-ink"
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Mis órdenes
            </button>
          )}

          <details className="relative">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] font-medium text-ink-soft shadow-card transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
              <Columns3 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Columnas
            </summary>
            <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-line bg-surface p-1 shadow-raised">
              {COLS.map((c) => {
                const on = visible.includes(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    disabled={c.alwaysOn}
                    onClick={() => toggleCol(c.key)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-surface-2 disabled:opacity-50"
                  >
                    <span
                      className={`grid h-3.5 w-3.5 place-items-center rounded-sm border ${
                        on
                          ? "border-primary bg-primary text-primary-ink"
                          : "border-line-strong"
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
                    {c.alwaysOn && (
                      <span className="ml-auto text-[10px] uppercase text-muted">
                        fija
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </details>
          </div>
        </div>
      )}

      <div
        className={`overflow-hidden rounded-lg border border-line bg-surface shadow-card ${
          apagado ? "opacity-60" : ""
        }`}
      >
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted">
              {cols.map((c) => (
                <th
                  key={c.key}
                  className={`px-3 py-2 font-medium ${c.width ?? ""} ${
                    c.align === "right"
                      ? "text-right"
                      : c.align === "center"
                        ? "text-center"
                        : ""
                  } ${colHidden(c.key)}`}
                >
                  <button
                    type="button"
                    onClick={() => sortBy(c.key)}
                    className={`inline-flex items-center gap-1 transition-colors hover:text-ink ${
                      c.align === "right" ? "flex-row-reverse" : ""
                    } ${sortKey === c.key ? "text-ink" : ""}`}
                  >
                    {c.label}
                    {sortKey === c.key ? (
                      sortDir === "asc" ? (
                        <ChevronUp className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                      ) : (
                        <ChevronDown className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                      )
                    ) : (
                      <ChevronsUpDown
                        className="h-3 w-3 opacity-40"
                        strokeWidth={2}
                        aria-hidden
                      />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((o) => (
              <Row key={o.id} orden={o} cols={cols} />
            ))}
            {filas.length === 0 && (
              <tr>
                <td
                  colSpan={cols.length}
                  className="px-3 py-8 text-center text-[13px] text-muted"
                >
                  Nada coincide con “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function suplidoresDistintos(o: OrdenConItems): string[] {
  return Array.from(
    new Set(o.item.map((i) => i.suplidor).filter(Boolean) as string[]),
  );
}

// El ítem pendiente con ETA más tardía: el que marca el riesgo de la orden.
function itemEnEspera(o: OrdenConItems): ItemResumen | null {
  return o.item
    .filter((i) => !i.entregado && i.fecha_estim)
    .reduce<ItemResumen | null>(
      (m, i) => (!m || (i.fecha_estim ?? "") > (m.fecha_estim ?? "") ? i : m),
      null,
    );
}

// Barra de progreso de ítems: un segmento por ítem (entregado / en curso / pendiente).
function ItemsProgreso({ items }: { items: ItemResumen[] }) {
  const listos = items.filter((i) => i.entregado).length;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex gap-0.5">
        {items.map((i, idx) => {
          const color = i.entregado
            ? "bg-ok"
            : i.estado_item && i.estado_item !== "pendiente"
              ? "bg-primary"
              : "bg-line";
          return (
            <span
              key={idx}
              className={`h-1.5 w-3 rounded-full ${color}`}
              title={i.nombre}
            />
          );
        })}
      </span>
      <span className="font-mono text-[11px] text-muted">
        {listos}/{items.length}
      </span>
    </span>
  );
}

// Responsivo: oculta columnas secundarias en pantallas chicas.
function colHidden(key: ColKey): string {
  if (key === "suplidor") return "hidden lg:table-cell";
  if (key === "estado" || key === "institucion") return "hidden md:table-cell";
  if (key === "items" || key === "responsable") return "hidden sm:table-cell";
  return "";
}

function Row({ orden, cols }: { orden: OrdenConItems; cols: ColDef[] }) {
  const dias = diasRestantes(plazoDominante(orden));
  const nivel = nivelUrgencia(dias);
  const total = orden.item.length;
  const href = `/orden/${orden.id}`;
  const espera = itemEnEspera(orden);
  const diasEspera = espera ? diasRestantes(espera.fecha_estim ?? null) : null;

  const cell: Record<ColKey, React.ReactNode> = {
    plazo: (
      <Link href={href} className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${urgenciaDot(nivel)}`} />
        <span
          className={`rounded px-1.5 py-0.5 font-mono text-xs font-medium ${urgenciaChip(
            nivel,
          )}`}
        >
          {textoDias(dias)}
        </span>
      </Link>
    ),
    oc: (
      <Link href={href} className="block">
        <span className="font-mono text-[13px] font-medium text-ink group-hover:text-primary">
          {orden.numero_oc || "OC s/n"}
        </span>
        {espera && (
          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
            <Clock className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            <span className="truncate">espera: {espera.nombre}</span>
            <span
              className={`shrink-0 rounded px-1 font-mono text-[10px] font-medium ${urgenciaChip(
                nivelUrgencia(diasEspera),
              )}`}
            >
              {textoDias(diasEspera)}
            </span>
          </span>
        )}
        {orden.etiquetas.length > 0 && (
          <span className="mt-0.5 flex flex-wrap gap-1">
            {orden.etiquetas.map((e) => (
              <span
                key={e}
                className="rounded bg-surface-2 px-1.5 py-px text-[10px] text-muted"
              >
                {e}
              </span>
            ))}
          </span>
        )}
      </Link>
    ),
    responsable: orden.responsable ? (
      <span className="flex items-center gap-1.5">
        <Avatar nombre={orden.responsable.nombre} size={20} />
        <span className="truncate text-[13px] text-ink-soft">
          {orden.responsable.nombre}
        </span>
      </span>
    ) : (
      <span className="text-xs text-muted">Sin asignar</span>
    ),
    institucion: (
      <span className="truncate text-[13px] text-ink-soft">
        {orden.institucion || "—"}
      </span>
    ),
    estado: (
      <span
        className={`rounded px-2 py-0.5 text-xs font-medium ${estadoChip(
          orden.estado,
        )}`}
      >
        {ESTADO_LABEL[orden.estado]}
      </span>
    ),
    items: total > 0 ? <ItemsProgreso items={orden.item} /> : (
      <span className="text-muted">—</span>
    ),
    suplidor: (() => {
      const s = suplidoresDistintos(orden);
      return (
        <span className="truncate text-xs text-muted">
          {s.length === 0 ? "—" : s.length === 1 ? s[0] : `${s.length} suplidores`}
        </span>
      );
    })(),
    monto: (
      <span className="font-mono text-[13px] font-medium text-ink">
        {formatRD(orden.monto, orden.moneda)}
      </span>
    ),
  };

  return (
    <tr className="group border-b border-line last:border-0 odd:bg-surface-2/35 hover:bg-surface-2">
      {cols.map((c) => (
        <td
          key={c.key}
          className={`px-3 py-2 align-middle ${
            c.align === "right"
              ? "text-right"
              : c.align === "center"
                ? "text-center"
                : ""
          } ${colHidden(c.key)}`}
        >
          {cell[c.key]}
        </td>
      ))}
    </tr>
  );
}
