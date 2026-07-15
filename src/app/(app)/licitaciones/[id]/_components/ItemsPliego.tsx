"use client";

// PASO 1 — El pliego: capturar QUÉ PIDEN. Solo la spec tal cual, cantidades
// y la decisión de ofertar o descartar. Ni un precio: la cotización es el
// paso 2, cuando ya se tiene el panorama completo.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Plus, Trash2 } from "lucide-react";
import { Panel, SectionTitle, btnPrimary } from "@/components/ui";
import {
  actualizarItemAction,
  crearItemAction,
  eliminarItemAction,
} from "@/lib/actions/licitaciones";
import type { LicItem, LicProceso } from "@/lib/licitaciones/tipos";

const inputSm =
  "rounded-md border border-line bg-surface px-2 py-1 text-[12.5px] text-ink outline-none focus:border-primary";

export default function ItemsPliego({
  proceso,
  items,
}: {
  proceso: LicProceso;
  items: LicItem[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function correr(fn: () => Promise<string | null>) {
    setError(null);
    startTransition(async () => {
      const err = await fn();
      if (err) setError(err);
      router.refresh();
    });
  }

  return (
    <Panel>
      <SectionTitle
        icon={ListChecks}
        right={
          <button
            type="button"
            disabled={pendiente}
            onClick={() => correr(() => crearItemAction(proceso.id))}
            className={btnPrimary("!px-2.5 !py-1 !text-[12.5px]")}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
            Ítem
          </button>
        }
      >
        Ítems del pliego ({items.length})
      </SectionTitle>

      {error && (
        <p className="mx-4 mt-3 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      )}

      <ul className="divide-y divide-line">
        {items.map((item) => (
          <li key={item.id} className="space-y-2 px-4 py-3">
            <div className="flex items-start gap-2">
              <span className="mt-1 font-mono text-xs font-semibold text-muted">
                #{item.numero}
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <textarea
                  defaultValue={item.spec_cruda}
                  placeholder="Especificación TAL CUAL aparece en el pliego…"
                  rows={2}
                  onBlur={(e) => {
                    if (e.target.value !== item.spec_cruda)
                      correr(() =>
                        actualizarItemAction(item.id, { spec_cruda: e.target.value }),
                      );
                  }}
                  className="w-full resize-y rounded-md border border-line bg-surface px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-primary"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    defaultValue={item.cantidad}
                    min={0.01}
                    step="0.01"
                    title="Cantidad"
                    onBlur={(e) => {
                      const v = Number(e.target.value) || 1;
                      if (v !== item.cantidad)
                        correr(() => actualizarItemAction(item.id, { cantidad: v }));
                    }}
                    className={`${inputSm} w-20 text-right`}
                  />
                  <input
                    defaultValue={item.unidad}
                    title="Unidad"
                    onBlur={(e) => {
                      if (e.target.value !== item.unidad)
                        correr(() =>
                          actualizarItemAction(item.id, {
                            unidad: e.target.value || "UD",
                          }),
                        );
                    }}
                    className={`${inputSm} w-16`}
                  />
                  <label className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
                    <input
                      type="checkbox"
                      checked={item.ofertamos}
                      onChange={(e) =>
                        correr(() =>
                          actualizarItemAction(item.id, { ofertamos: e.target.checked }),
                        )
                      }
                    />
                    Ofertamos
                  </label>
                  {!item.ofertamos && (
                    <input
                      defaultValue={item.motivo_descarte ?? ""}
                      placeholder="Motivo del descarte (obligatorio)"
                      onBlur={(e) =>
                        correr(() =>
                          actualizarItemAction(item.id, {
                            motivo_descarte: e.target.value || null,
                          }),
                        )
                      }
                      className={`${inputSm} min-w-52 flex-1`}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`¿Eliminar el ítem ${item.numero}?`))
                        correr(() => eliminarItemAction(item.id));
                    }}
                    disabled={pendiente}
                    className="ml-auto rounded p-1 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                    aria-label="Eliminar ítem"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted">
            Agrega los ítems del pliego. La descripción se pega TAL CUAL — es
            la evidencia de lo que pidió la entidad. Los precios van después,
            en el paso de cotización.
          </li>
        )}
      </ul>
    </Panel>
  );
}
