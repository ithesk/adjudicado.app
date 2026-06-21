"use client";

import { useState, useTransition } from "react";
import { CalendarClock } from "lucide-react";
import type { Orden } from "@/lib/types";
import { Panel, SectionTitle, inputBase } from "@/components/ui";
import { actualizarPlazos } from "../actions";

export default function PlazosPanel({
  ordenId,
  orden,
}: {
  ordenId: string;
  orden: Orden;
}) {
  const [plazo, setPlazo] = useState(orden.plazo_entrega ?? "");
  const [pagoDias, setPagoDias] = useState(
    orden.plazo_pago_dias != null ? String(orden.plazo_pago_dias) : "",
  );
  const [metodo, setMetodo] = useState(orden.metodo_pago ?? "");
  const [pending, startTransition] = useTransition();
  const [guardado, setGuardado] = useState(false);

  function guardar() {
    startTransition(async () => {
      await actualizarPlazos(ordenId, plazo, pagoDias, metodo);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 1500);
    });
  }

  return (
    <Panel>
      <SectionTitle icon={CalendarClock}>Plazos y pago</SectionTitle>
      <div className="p-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">
              Plazo de entrega
            </span>
            <input
              type="date"
              value={plazo}
              onChange={(e) => setPlazo(e.target.value)}
              className={inputBase}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">
              Plazo de pago (días)
            </span>
            <input
              type="number"
              value={pagoDias}
              onChange={(e) => setPagoDias(e.target.value)}
              placeholder="30"
              className={inputBase}
            />
          </label>
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs font-medium text-muted">
              Método de pago
            </span>
            <input
              value={metodo}
              onChange={(e) => setMetodo(e.target.value)}
              placeholder="Transferencia, cheque…"
              className={inputBase}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={guardar}
          disabled={pending}
          className="mt-3 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink disabled:opacity-55"
        >
          {pending ? "Guardando…" : guardado ? "Guardado" : "Guardar"}
        </button>
      </div>
    </Panel>
  );
}
