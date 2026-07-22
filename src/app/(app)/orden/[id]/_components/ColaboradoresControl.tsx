"use client";

import { useState, useTransition } from "react";
import { ChevronDown, UsersRound, Check } from "lucide-react";
import type { Persona } from "@/lib/types";
import { Avatar } from "@/components/ui";
import { avisoError } from "@/lib/avisos";
import { actualizarColaboradores } from "../actions";
import { useActividad } from "./Actividad";

export default function ColaboradoresControl({
  ordenId,
  colaboradores: inicial,
  responsableId,
  personas,
}: {
  ordenId: string;
  colaboradores: Persona[];
  responsableId: string | null;
  personas: Persona[];
}) {
  // Estado local optimista: el colaborador entra/sale al instante.
  const [ids, setIds] = useState<string[]>(inicial.map((p) => p.id));
  const [, startTransition] = useTransition();
  const { emitir } = useActividad();

  const seleccionados = personas.filter((p) => ids.includes(p.id));

  function toggle(p: Persona) {
    const previos = ids;
    const dentro = ids.includes(p.id);
    const next = dentro ? ids.filter((x) => x !== p.id) : [...ids, p.id];
    setIds(next);
    emitir(
      dentro
        ? `Quitó a ${p.nombre} de los colaboradores.`
        : `Agregó a ${p.nombre} como colaborador.`,
    );
    startTransition(async () => {
      // Si el guardado falla, restauramos la lista previa y avisamos.
      try {
        const err = await actualizarColaboradores(ordenId, next);
        if (err) {
          setIds(previos);
          avisoError(err);
        }
      } catch {
        setIds(previos);
        avisoError("No se pudieron guardar los colaboradores.");
      }
    });
  }

  return (
    <details data-colab className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] shadow-card transition-colors hover:border-line-strong [&::-webkit-details-marker]:hidden">
        {seleccionados.length > 0 ? (
          <span className="flex items-center -space-x-1.5">
            {seleccionados.slice(0, 4).map((p) => (
              <span key={p.id} className="ring-2 ring-surface rounded-full">
                <Avatar nombre={p.nombre} size={20} />
              </span>
            ))}
            {seleccionados.length > 4 && (
              <span className="grid h-5 w-5 place-items-center rounded-full bg-surface-2 text-[10px] font-medium text-muted ring-2 ring-surface">
                +{seleccionados.length - 4}
              </span>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-muted">
            <UsersRound className="h-4 w-4" strokeWidth={2} aria-hidden />
            Agregar colaboradores
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-muted" strokeWidth={2} aria-hidden />
      </summary>

      <div className="absolute right-0 z-20 mt-1 w-60 rounded-md border border-line bg-surface p-1 shadow-raised">
        <p className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
          Colaboradores
        </p>
        {personas.length === 0 && (
          <p className="px-2 py-1.5 text-[12px] text-muted">
            Invita a tu equipo para sumar colaboradores.
          </p>
        )}
        {personas.map((p) => {
          const activo = ids.includes(p.id);
          const esResponsable = p.id === responsableId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-surface-2"
            >
              <Avatar nombre={p.nombre} size={20} />
              <span className="flex-1 truncate">
                {p.nombre}
                {esResponsable && (
                  <span className="ml-1 text-[11px] text-muted">· responsable</span>
                )}
              </span>
              {activo && (
                <Check className="h-3.5 w-3.5 text-primary" strokeWidth={2.5} aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </details>
  );
}
