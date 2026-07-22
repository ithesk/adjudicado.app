"use client";

import { useState, useTransition } from "react";
import { ChevronDown, UsersRound, Check } from "lucide-react";
import type { Grupo } from "@/lib/types";
import { avisoError } from "@/lib/avisos";
import { asignarGrupo } from "@/lib/actions/grupos";
import { useActividad } from "./Actividad";

export default function GrupoControl({
  ordenId,
  grupoId: inicial,
  grupos,
}: {
  ordenId: string;
  grupoId: string | null;
  grupos: Grupo[];
}) {
  // Optimista: el cambio se ve al instante.
  const [grupoId, setGrupoId] = useState<string | null>(inicial);
  const [, startTransition] = useTransition();
  const { emitir } = useActividad();
  const actual = grupos.find((g) => g.id === grupoId) ?? null;

  function asignar(id: string | null) {
    const previo = grupoId;
    const g = id ? grupos.find((x) => x.id === id) ?? null : null;
    setGrupoId(id);
    emitir(
      g ? `Asignó la orden al grupo ${g.nombre}.` : "Quitó el grupo de la orden.",
    );
    startTransition(async () => {
      // asignarGrupo no devuelve error; si la llamada lanza, restauramos y avisamos.
      try {
        await asignarGrupo(ordenId, id);
      } catch {
        setGrupoId(previo);
        avisoError("No se pudo guardar el grupo.");
      }
    });
    document
      .querySelectorAll<HTMLDetailsElement>("details[data-grupo]")
      .forEach((d) => (d.open = false));
  }

  return (
    <details data-grupo className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] shadow-card transition-colors hover:border-line-strong [&::-webkit-details-marker]:hidden">
        {actual ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-ink">
            <UsersRound className="h-4 w-4 text-muted" strokeWidth={2} aria-hidden />
            {actual.nombre}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-muted">
            <UsersRound className="h-4 w-4" strokeWidth={2} aria-hidden />
            Asignar grupo
          </span>
        )}
        <ChevronDown className="ml-auto h-3.5 w-3.5 text-muted" strokeWidth={2} aria-hidden />
      </summary>

      <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-line bg-surface p-1 shadow-raised">
        <p className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
          Grupo
        </p>
        {grupos.length === 0 && (
          <p className="px-2 py-1.5 text-[12px] text-muted">
            Crea grupos en Configuración → Grupos.
          </p>
        )}
        {grupos.map((g) => {
          const activo = g.id === grupoId;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => asignar(g.id)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-surface-2"
            >
              <span className="flex-1 truncate">{g.nombre}</span>
              <span className="text-[11px] text-muted">{g.miembros.length}</span>
              {activo && (
                <Check className="h-3.5 w-3.5 text-primary" strokeWidth={2.5} aria-hidden />
              )}
            </button>
          );
        })}
        {actual && (
          <button
            type="button"
            onClick={() => asignar(null)}
            className="mt-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-muted transition-colors hover:bg-surface-2"
          >
            Sin grupo
          </button>
        )}
      </div>
    </details>
  );
}
