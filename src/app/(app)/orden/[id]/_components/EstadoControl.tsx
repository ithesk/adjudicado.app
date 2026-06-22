"use client";

import { useState, useTransition } from "react";
import { ArrowRight, CheckCircle2, BadgeCheck } from "lucide-react";
import { ESTADO_LABEL, siguienteEstado, type Estado } from "@/lib/types";
import { avanzarEstado } from "../actions";
import { useActividad } from "./Actividad";

export default function EstadoControl({
  ordenId,
  estado: inicial,
}: {
  ordenId: string;
  estado: Estado;
}) {
  // Estado local optimista para que el avance se vea sin recargar.
  const [estado, setEstado] = useState<Estado>(inicial);
  const [, startTransition] = useTransition();
  const { emitir } = useActividad();
  const proximo = siguienteEstado(estado);

  // Regla de negocio: la orden se cierra cuando se valida el pago. Por eso
  // "cobrado" es el estado final operativo (no seguimos hacia "cerrado").
  if (!proximo || estado === "cobrado") {
    const cerrada = estado === "cobrado" || estado === "cerrado";
    return (
      <p className="inline-flex items-center gap-1.5 text-[13px] text-muted">
        <CheckCircle2 className="h-4 w-4 text-ok" strokeWidth={2} aria-hidden />
        {cerrada
          ? "Pago validado · orden cerrada."
          : `Orden ${ESTADO_LABEL[estado].toLowerCase()}.`}
      </p>
    );
  }

  const esHandoff = estado === "listo_facturar";
  const esPago = estado === "facturado"; // facturado → cobrado = validar pago
  const etiqueta = esHandoff
    ? "Marcar facturado en Odoo"
    : esPago
      ? "Validar pago y cerrar"
      : `Avanzar a ${ESTADO_LABEL[proximo]}`;

  function avanzar() {
    const destino = siguienteEstado(estado);
    if (!destino) return;
    setEstado(destino);
    emitir(
      esPago
        ? "Validó el pago. La orden queda cerrada."
        : `Avanzó la orden a ${ESTADO_LABEL[destino]}.`,
    );
    startTransition(() => avanzarEstado(ordenId, estado));
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={avanzar}
        className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium shadow-card transition-colors ${
          esPago
            ? "bg-ok text-white hover:opacity-90"
            : "bg-primary text-primary-ink hover:bg-primary-hover"
        }`}
      >
        {etiqueta}
        {esPago ? (
          <BadgeCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
        ) : (
          <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
        )}
      </button>
      {esHandoff && (
        <span className="text-xs text-muted">
          La factura / e-CF se emite en Odoo, fuera del sistema.
        </span>
      )}
      {esPago && (
        <span className="text-xs text-muted">
          Al validar el pago la orden se da por cobrada y se cierra.
        </span>
      )}
    </div>
  );
}
