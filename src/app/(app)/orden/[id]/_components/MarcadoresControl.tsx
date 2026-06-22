"use client";

import { useState, useTransition } from "react";
import { X, Plus } from "lucide-react";
import { agregarEtiqueta, quitarEtiqueta } from "../actions";
import { useActividad } from "./Actividad";

const SUGERIDAS = ["urgente", "espera-suplidor", "espera-acta", "subsanacion"];

export default function MarcadoresControl({
  ordenId,
  etiquetas: iniciales,
}: {
  ordenId: string;
  etiquetas: string[];
}) {
  // Estado local optimista: el marcador aparece/desaparece al instante.
  const [etiquetas, setEtiquetas] = useState<string[]>(iniciales);
  const [nueva, setNueva] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [, startTransition] = useTransition();
  const { emitir } = useActividad();

  function agregar(valor: string) {
    const v = valor.trim();
    if (!v || etiquetas.includes(v)) {
      setNueva("");
      setAbierto(false);
      return;
    }
    setEtiquetas((prev) => [...prev, v]);
    setNueva("");
    setAbierto(false);
    emitir(`Agregó el marcador “${v}”.`);
    startTransition(() => agregarEtiqueta(ordenId, v));
  }

  function quitar(v: string) {
    setEtiquetas((prev) => prev.filter((e) => e !== v));
    emitir(`Quitó el marcador “${v}”.`);
    startTransition(() => quitarEtiqueta(ordenId, v));
  }

  const disponibles = SUGERIDAS.filter((s) => !etiquetas.includes(s));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {etiquetas.length === 0 && !abierto && (
        <span className="text-[13px] text-muted">—</span>
      )}
      {etiquetas.map((e) => (
        <span
          key={e}
          className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-soft"
        >
          {e}
          <button
            type="button"
            onClick={() => quitar(e)}
            className="text-muted transition-colors hover:text-danger"
            aria-label={`Quitar ${e}`}
          >
            <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          </button>
        </span>
      ))}

      {!abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-dashed border-line text-muted transition-colors hover:border-line-strong hover:text-ink"
          aria-label="Agregar marcador"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
        </button>
      ) : (
        <span className="inline-flex flex-wrap items-center gap-1">
          {disponibles.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => agregar(s)}
              className="rounded-md border border-dashed border-line px-2 py-0.5 text-xs text-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              {s}
            </button>
          ))}
          <input
            autoFocus
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                agregar(nueva);
              }
              if (e.key === "Escape") setAbierto(false);
            }}
            onBlur={() => !nueva && setAbierto(false)}
            placeholder="otro…"
            className="w-20 rounded-md border border-line bg-surface px-2 py-0.5 text-xs text-ink outline-none focus:border-primary"
          />
        </span>
      )}
    </div>
  );
}
