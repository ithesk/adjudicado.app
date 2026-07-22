"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { btnPrimary } from "@/components/ui";
import { crearEntidadAction } from "@/lib/actions/entidades";

export default function NuevaEntidad() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className={btnPrimary()}>
        <Plus className="h-4 w-4" strokeWidth={2.4} aria-hidden />
        Nueva entidad
      </button>
    );
  }
  return (
    <form
      action={(fd) => {
        const nombre = String(fd.get("nombre") || "");
        startTransition(async () => {
          const err = await crearEntidadAction(nombre);
          if (err) setError(err);
          else {
            setAbierto(false);
            setError(null);
          }
          router.refresh();
        });
      }}
      className="flex items-center gap-1.5"
    >
      <input
        name="nombre"
        autoFocus
        required
        placeholder="Nombre o RNC de la entidad"
        title="Con el RNC traemos el nombre oficial de la DGII; con el nombre buscamos su RNC"
        className="w-64 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-primary"
      />
      <button type="submit" disabled={pendiente} className={btnPrimary("!px-3 !py-1.5")}>
        Crear
      </button>
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </form>
  );
}
