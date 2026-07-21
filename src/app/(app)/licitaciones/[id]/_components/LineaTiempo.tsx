"use client";

// La línea de tiempo de la licitación: el recorrido completo del proceso
// (captura → calificación → costeo → armado → listo → sometido → resultado).
// Es la columna vertebral de la Bid Room: se ve dónde está el proceso, qué
// falta, y avanzar es la acción principal.

import { ArrowRight, Check } from "lucide-react";
import { btnPrimary } from "@/components/ui";
import {
  ESTADO_LIC_CHIP,
  ESTADO_LIC_DESCRIPCION,
  ESTADO_LIC_LABEL,
  type EstadoLicitacion,
} from "@/lib/licitaciones/tipos";

// El camino feliz; subsanación y los terminales se muestran aparte.
const LINEA: EstadoLicitacion[] = [
  "captura",
  "calificacion",
  "costeo",
  "armado",
  "listo",
  "sometido",
];

// La presentación sale de ESTADO_LIC_CHIP (misma fuente que la lista).
const TERMINALES: EstadoLicitacion[] = ["adjudicado", "perdido", "descartado"];

export default function LineaTiempo({
  estado,
  pendiente,
  onCambiar,
}: {
  estado: EstadoLicitacion;
  pendiente: boolean;
  onCambiar: (estado: EstadoLicitacion) => void;
}) {
  const idx = LINEA.indexOf(estado);
  // Subsanación y terminales viven "después de sometido" en la línea.
  const posicion = idx >= 0 ? idx : LINEA.length;
  const siguiente = idx >= 0 && idx < LINEA.length - 1 ? LINEA[idx + 1] : null;
  const enSubsanacion = estado === "subsanacion";
  const terminal = TERMINALES.find((t) => t === estado);

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {LINEA.map((e, i) => {
        const hecho = i < posicion || (i === posicion && !!terminal);
        const actual = e === estado;
        return (
          <span key={e} className="flex items-center">
            {i > 0 && (
              <span
                className={`h-px w-4 sm:w-6 ${i <= posicion ? "bg-primary" : "bg-line"}`}
                aria-hidden
              />
            )}
            <button
              type="button"
              disabled={pendiente || actual}
              onClick={() => onCambiar(e)}
              title={ESTADO_LIC_DESCRIPCION[e]}
              className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[11.5px] font-medium transition-colors ${
                actual
                  ? "bg-primary text-primary-ink"
                  : hecho
                    ? "text-primary hover:bg-primary/10"
                    : "text-muted hover:bg-surface-2"
              }`}
            >
              <span
                className={`grid h-3.5 w-3.5 place-items-center rounded-full border ${
                  actual
                    ? "border-primary-ink"
                    : hecho
                      ? "border-primary bg-primary"
                      : "border-line-strong"
                }`}
              >
                {hecho && !actual && (
                  <Check className="h-2.5 w-2.5 text-primary-ink" strokeWidth={3} aria-hidden />
                )}
              </span>
              {ESTADO_LIC_LABEL[e]}
            </button>
          </span>
        );
      })}

      {/* Subsanación: desvío posible tras someter. */}
      {enSubsanacion && (
        <span className={`rounded-full px-2 py-1 text-[11.5px] font-medium ${ESTADO_LIC_CHIP.subsanacion.chip}`}>
          En subsanación
        </span>
      )}
      {terminal && (
        <span className={`rounded-full px-2 py-1 text-[11.5px] font-semibold ${ESTADO_LIC_CHIP[terminal].chip}`}>
          {ESTADO_LIC_LABEL[terminal]}
        </span>
      )}

      <span className="ml-auto flex items-center gap-1.5">
        {siguiente && (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => onCambiar(siguiente)}
            className={btnPrimary("!px-2.5 !py-1 !text-[12px]")}
          >
            Avanzar a {ESTADO_LIC_LABEL[siguiente]}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
          </button>
        )}
        {(estado === "sometido" || enSubsanacion) && (
          <>
            {!enSubsanacion && (
              <button
                type="button"
                disabled={pendiente}
                onClick={() => onCambiar("subsanacion")}
                className="rounded-md bg-warn-soft px-2 py-1 text-[12px] font-medium text-warn transition-colors hover:opacity-80"
              >
                Subsanación
              </button>
            )}
            <button
              type="button"
              disabled={pendiente}
              onClick={() => onCambiar("adjudicado")}
              className="rounded-md bg-ok-soft px-2 py-1 text-[12px] font-medium text-ok transition-colors hover:opacity-80"
            >
              Adjudicado
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => onCambiar("perdido")}
              className="rounded-md bg-danger-soft px-2 py-1 text-[12px] font-medium text-danger transition-colors hover:opacity-80"
            >
              Perdido
            </button>
          </>
        )}
      </span>
    </div>
  );
}
