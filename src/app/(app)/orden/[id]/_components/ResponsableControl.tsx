"use client";

import { useState, useTransition } from "react";
import { ChevronDown, UserPlus, Check } from "lucide-react";
import type { Persona } from "@/lib/types";
import { Avatar } from "@/components/ui";
import { asignarResponsable } from "../actions";
import { useActividad } from "./Actividad";

export default function ResponsableControl({
  ordenId,
  responsable: inicial,
  personas,
}: {
  ordenId: string;
  responsable: Persona | null;
  personas: Persona[];
}) {
  // Estado local optimista: se ve al instante (en demo y en real).
  const [responsable, setResponsable] = useState<Persona | null>(inicial);
  const [, startTransition] = useTransition();
  const { emitir } = useActividad();

  function asignar(id: string | null) {
    const p = id ? personas.find((x) => x.id === id) ?? null : null;
    setResponsable(p);
    emitir(
      p
        ? `Asignó la orden a ${p.nombre}.`
        : "Quitó el responsable de la orden.",
    );
    startTransition(() => asignarResponsable(ordenId, id));
    document
      .querySelectorAll<HTMLDetailsElement>("details[data-resp]")
      .forEach((d) => (d.open = false));
  }

  return (
    <details data-resp className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] shadow-card transition-colors hover:border-line-strong [&::-webkit-details-marker]:hidden">
        {responsable ? (
          <>
            <Avatar nombre={responsable.nombre} size={20} />
            <span className="font-medium text-ink">{responsable.nombre}</span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-muted">
            <UserPlus className="h-4 w-4" strokeWidth={2} aria-hidden />
            Asignar responsable
          </span>
        )}
        <ChevronDown
          className="h-3.5 w-3.5 text-muted"
          strokeWidth={2}
          aria-hidden
        />
      </summary>

      <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-line bg-surface p-1 shadow-raised">
        <p className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
          Responsable
        </p>
        {personas.length === 0 && (
          <p className="px-2 py-1.5 text-[12px] text-muted">
            Invita a tu equipo para asignar responsables.
          </p>
        )}
        {personas.map((p) => {
          const activo = responsable?.id === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => asignar(p.id)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-surface-2"
            >
              <Avatar nombre={p.nombre} size={20} />
              <span className="flex-1 truncate">{p.nombre}</span>
              {activo && (
                <Check className="h-3.5 w-3.5 text-primary" strokeWidth={2.5} aria-hidden />
              )}
            </button>
          );
        })}
        {responsable && (
          <button
            type="button"
            onClick={() => asignar(null)}
            className="mt-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-muted transition-colors hover:bg-surface-2"
          >
            Sin asignar
          </button>
        )}
      </div>
    </details>
  );
}
