"use client";

import { useState, useTransition } from "react";
import { ArrowRight, CheckCircle2, BadgeCheck } from "lucide-react";
import { ESTADO_LABEL, siguienteEstado, type Estado } from "@/lib/types";
import { avisoError } from "@/lib/avisos";
import { avanzarEstado, fijarEstado } from "../actions";
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

  // Avanza un paso por la máquina lineal.
  function avanzar(mensaje: string) {
    const previo = estado;
    const destino = siguienteEstado(previo);
    if (!destino) return;
    setEstado(destino);
    emitir(mensaje);
    startTransition(async () => {
      // Si el guardado falla, restauramos el estado previo y avisamos.
      try {
        const err = await avanzarEstado(ordenId, previo);
        if (err) {
          setEstado(previo);
          avisoError(err);
        }
      } catch {
        setEstado(previo);
        avisoError("No se pudo guardar el cambio de estado.");
      }
    });
  }

  // Salta a un estado puntual (p. ej. cobrar directo, sin pasar por libramiento).
  function saltar(destino: Estado, mensaje: string) {
    const previo = estado;
    setEstado(destino);
    emitir(mensaje);
    startTransition(async () => {
      try {
        const err = await fijarEstado(ordenId, destino);
        if (err) {
          setEstado(previo);
          avisoError(err);
        }
      } catch {
        setEstado(previo);
        avisoError("No se pudo guardar el cambio de estado.");
      }
    });
  }

  // En Facturado el libramiento es OPCIONAL: hay instituciones que pagan directo.
  if (estado === "facturado") {
    return (
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => avanzar("Avanzó la orden a Libramiento.")}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-ink shadow-card transition-colors hover:bg-primary-hover"
        >
          Registrar libramiento
          <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() =>
            saltar("cobrado", "Validó el pago (sin libramiento). La orden queda cerrada.")
          }
          className="inline-flex items-center gap-1.5 rounded-md bg-ok px-3.5 py-2 text-sm font-medium text-white shadow-card transition-colors hover:opacity-90"
        >
          Cobrar directo
          <BadgeCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
        <span className="w-full text-xs text-muted sm:w-auto">
          Si esta institución paga sin libramiento, usa “Cobrar directo”.
        </span>
      </div>
    );
  }

  const esHandoff = estado === "listo_facturar";
  const esPago = estado === "libramiento"; // libramiento → cobrado = validar pago
  const etiqueta = esHandoff
    ? "Marcar facturado"
    : esPago
      ? "Validar pago y cerrar"
      : `Avanzar a ${ESTADO_LABEL[proximo]}`;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() =>
          avanzar(
            esPago
              ? "Validó el pago. La orden queda cerrada."
              : `Avanzó la orden a ${ESTADO_LABEL[proximo]}.`,
          )
        }
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
          La factura / e-CF se emite en tu sistema de facturación, fuera de aquí.
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
