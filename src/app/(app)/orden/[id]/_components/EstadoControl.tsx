"use client";

import { useTransition } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { ESTADO_LABEL, siguienteEstado, type Estado } from "@/lib/types";
import { avanzarEstado } from "../actions";

export default function EstadoControl({
  ordenId,
  estado,
}: {
  ordenId: string;
  estado: Estado;
}) {
  const [pending, startTransition] = useTransition();
  const proximo = siguienteEstado(estado);

  if (!proximo) {
    return (
      <p className="inline-flex items-center gap-1.5 text-[13px] text-muted">
        <CheckCircle2 className="h-4 w-4 text-ok" strokeWidth={2} aria-hidden />
        Orden {ESTADO_LABEL[estado].toLowerCase()}.
      </p>
    );
  }

  const esHandoff = estado === "listo_facturar";
  const etiqueta = esHandoff
    ? "Marcar facturado en Odoo"
    : `Avanzar a ${ESTADO_LABEL[proximo]}`;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => avanzarEstado(ordenId, estado))}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-ink shadow-card transition-colors hover:bg-primary-hover disabled:opacity-55"
      >
        {pending ? "Actualizando…" : etiqueta}
        {!pending && (
          <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
        )}
      </button>
      {esHandoff && (
        <span className="text-xs text-muted">
          La factura / e-CF se emite en Odoo, fuera del sistema.
        </span>
      )}
    </div>
  );
}
