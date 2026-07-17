"use client";

import { coincideTexto } from "@/lib/buscar-texto";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  Phone,
  Mail,
  StickyNote,
  Package,
  Activity,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui";
import { formatFecha, tiempoRelativo } from "@/lib/types";
import type { ActividadGlobal } from "@/lib/queries";

const META: Record<string, { label: string; icon: LucideIcon; tono: string }> = {
  llamada: { label: "Llamada", icon: Phone, tono: "text-primary" },
  correo: { label: "Correo", icon: Mail, tono: "text-primary" },
  nota: { label: "Nota", icon: StickyNote, tono: "text-muted" },
  suplidor: { label: "Suplidor", icon: Package, tono: "text-warn" },
  evento: { label: "Evento", icon: Activity, tono: "text-muted" },
};

function meta(tipo: string) {
  return META[tipo] ?? META.nota;
}

const FILTROS: { key: string; label: string }[] = [
  { key: "todo", label: "Todo" },
  { key: "evento", label: "Eventos" },
  { key: "nota", label: "Notas" },
  { key: "llamada", label: "Llamadas" },
  { key: "correo", label: "Correos" },
];

export default function ActividadFeed({
  actividad,
}: {
  actividad: ActividadGlobal[];
}) {
  const [query, setQuery] = useState("");
  const [tipo, setTipo] = useState("todo");

  const resultados = useMemo(() => {
    const q = query.trim();
    return actividad.filter((a) => {
      if (tipo !== "todo" && a.tipo !== tipo) return false;
      if (!q) return true;
      return coincideTexto(
        [a.texto, a.numeroOc, a.institucion, a.itemNombre, a.autor?.nombre]
          .filter(Boolean)
          .join(" "),
        q,
      );
    });
  }, [actividad, query, tipo]);

  // Agrupa por día para dar ritmo al feed.
  const grupos = useMemo(() => {
    const map = new Map<string, ActividadGlobal[]>();
    for (const a of resultados) {
      const dia = a.created_at.slice(0, 10);
      const arr = map.get(dia) ?? [];
      arr.push(a);
      map.set(dia, arr);
    }
    return Array.from(map, ([dia, items]) => ({ dia, items }));
  }, [resultados]);

  return (
    <div className="space-y-4">
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
          placeholder="Buscar en toda la actividad: orden, ítem, persona, texto…"
          className="w-full rounded-lg border border-line bg-surface py-2.5 pl-11 pr-3 text-sm text-ink shadow-card outline-none placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-[var(--ring)]"
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {FILTROS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setTipo(f.key)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              tipo === f.key
                ? "bg-primary/10 text-primary"
                : "border border-line text-muted hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto self-center text-[12px] text-muted">
          {resultados.length} {resultados.length === 1 ? "registro" : "registros"}
        </span>
      </div>

      {grupos.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface px-4 py-10 text-center text-[13px] text-muted shadow-card">
          Sin actividad todavía.
        </div>
      ) : (
        <div className="space-y-5">
          {grupos.map(({ dia, items }) => (
            <div key={dia} className="space-y-1">
              <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted">
                {formatFecha(dia)}
              </p>
              <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
                <ul className="divide-y divide-line">
                  {items.map((a) => {
                    const m = meta(a.tipo);
                    const Icon = m.icon;
                    return (
                      <li key={a.id} className="group flex gap-3 px-4 py-2.5">
                        <Avatar nombre={a.autor?.nombre} size={26} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="text-[13px] font-medium text-ink">
                              {a.autor?.nombre ??
                                (a.tipo === "evento" ? "Sistema" : "Miembro del equipo")}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                              <Icon className={`h-3 w-3 ${m.tono}`} strokeWidth={2} aria-hidden />
                              {m.label}
                            </span>
                            {a.itemNombre && (
                              <span
                                className="inline-flex max-w-[12rem] items-center gap-1 truncate rounded bg-surface-2 px-1.5 py-px text-[10px] font-medium text-muted"
                                title={a.itemNombre}
                              >
                                <Package className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
                                {a.itemNombre}
                              </span>
                            )}
                            <time className="ml-auto shrink-0 text-[11px] text-muted">
                              {tiempoRelativo(a.created_at)}
                            </time>
                          </div>
                          <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-soft">
                            {a.texto}
                          </p>
                          <Link
                            href={`/orden/${a.ordenId}`}
                            className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-muted transition-colors hover:text-primary"
                          >
                            {a.numeroOc || "Orden"}
                            {a.institucion ? ` · ${a.institucion}` : ""}
                            <ArrowUpRight className="h-3 w-3" strokeWidth={2} aria-hidden />
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
