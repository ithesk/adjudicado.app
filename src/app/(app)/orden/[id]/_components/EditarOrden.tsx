"use client";

import { useState, useTransition } from "react";
import { Pencil, X, Trash2 } from "lucide-react";
import { inputBase } from "@/components/ui";
import { avisoError } from "@/lib/avisos";
import { actualizarOrden, eliminarOrden } from "../actions";

interface Campos {
  numero_oc: string;
  institucion: string;
  codigo_expediente: string;
  moneda: "DOP" | "USD";
  monto: string;
  fecha_oc: string;
  plazo_entrega: string;
}

export default function EditarOrden({
  ordenId,
  inicial,
}: {
  ordenId: string;
  inicial: Campos;
}) {
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState<Campos>(inicial);
  const [pending, start] = useTransition();

  function set<K extends keyof Campos>(k: K, v: Campos[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  function borrar() {
    if (
      !confirm(
        `¿Eliminar la orden ${f.numero_oc || ""} y TODO su contenido (ítems, bitácora y documentos)? No se puede deshacer.`,
      )
    )
      return;
    start(async () => {
      // Si se elimina bien, la action redirige a «/»; si falla, avisamos.
      try {
        const err = await eliminarOrden(ordenId);
        if (err) avisoError(err);
      } catch {
        avisoError("No se pudo eliminar la orden.");
      }
    });
  }

  function guardar() {
    start(async () => {
      // Solo cerramos el modal si de verdad se guardó; si falla, avisamos.
      try {
        const err = await actualizarOrden(ordenId, {
          numero_oc: f.numero_oc.trim(),
          institucion: f.institucion.trim(),
          codigo_expediente: f.codigo_expediente.trim(),
          moneda: f.moneda,
          monto: f.monto === "" ? null : Number(f.monto),
          fecha_oc: f.fecha_oc,
          plazo_entrega: f.plazo_entrega,
        });
        if (err) {
          avisoError(err);
          return;
        }
        setAbierto(false);
      } catch {
        avisoError("No se pudieron guardar los cambios.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setF(inicial);
          setAbierto(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] font-medium text-ink-soft shadow-card transition-colors hover:border-line-strong hover:text-ink"
      >
        <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Editar
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 pt-[8vh] backdrop-blur-sm"
          onClick={() => setAbierto(false)}
        >
          <div
            className="flex max-h-[84vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-raised"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
              <p className="text-[14px] font-semibold text-ink">Editar orden</p>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
                className="rounded-md p-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2">
              <Campo label="Número de OC">
                <input
                  value={f.numero_oc}
                  onChange={(e) => set("numero_oc", e.target.value)}
                  className={inputBase}
                />
              </Campo>
              <Campo label="Institución">
                <input
                  value={f.institucion}
                  onChange={(e) => set("institucion", e.target.value)}
                  className={inputBase}
                />
              </Campo>
              <Campo label="Código de expediente">
                <input
                  value={f.codigo_expediente}
                  onChange={(e) => set("codigo_expediente", e.target.value)}
                  className={inputBase}
                />
              </Campo>
              <Campo label="Fecha de la OC">
                <input
                  type="date"
                  value={f.fecha_oc}
                  onChange={(e) => set("fecha_oc", e.target.value)}
                  className={inputBase}
                />
              </Campo>
              <Campo label="Moneda">
                <select
                  value={f.moneda}
                  onChange={(e) => set("moneda", e.target.value as "DOP" | "USD")}
                  className={inputBase}
                >
                  <option value="DOP">RD$</option>
                  <option value="USD">US$</option>
                </select>
              </Campo>
              <Campo label="Monto adjudicado">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={f.monto}
                  onChange={(e) => set("monto", e.target.value)}
                  placeholder="0.00"
                  className={inputBase}
                />
              </Campo>
              <Campo label="Plazo de entrega">
                <input
                  type="date"
                  value={f.plazo_entrega}
                  onChange={(e) => set("plazo_entrega", e.target.value)}
                  className={inputBase}
                />
              </Campo>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3">
              <button
                type="button"
                onClick={borrar}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Eliminar orden
              </button>
              <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="rounded-md border border-line px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardar}
                disabled={pending}
                className="rounded-md bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-primary-ink transition-colors hover:bg-primary-hover disabled:opacity-60"
              >
                {pending ? "Guardando…" : "Guardar cambios"}
              </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Campo({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
