"use client";

// PASO 0 — Los datos del proceso: la primera parada de la línea de tiempo.
// Todo con autosave (se guarda al salir del campo).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Loader2 } from "lucide-react";
import { Panel, SectionTitle, inputBase } from "@/components/ui";
import { actualizarProcesoAction } from "@/lib/actions/licitaciones";
import { MODALIDAD_LABEL, type LicProceso } from "@/lib/licitaciones/tipos";

type Estado = "idle" | "guardando" | "ok" | string;

export default function DatosProceso({
  proceso,
  instituciones,
}: {
  proceso: LicProceso;
  instituciones: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("idle");
  const [, startTransition] = useTransition();

  function autosave(patch: Parameters<typeof actualizarProcesoAction>[1]) {
    setEstado("guardando");
    startTransition(async () => {
      const err = await actualizarProcesoAction(proceso.id, patch);
      setEstado(err ?? "ok");
      if (!err) setTimeout(() => setEstado("idle"), 2000);
      router.refresh();
    });
  }

  return (
    <Panel>
      <SectionTitle
        icon={FileText}
        right={
          estado === "guardando" ? (
            <span className="flex items-center gap-1 text-[11.5px] text-muted">
              <Loader2 className="h-3 w-3 motion-safe:animate-spin" strokeWidth={2} aria-hidden />
              Guardando…
            </span>
          ) : estado === "ok" ? (
            <span className="flex items-center gap-1 text-[11.5px] text-ok">
              <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              Guardado
            </span>
          ) : estado !== "idle" ? (
            <span className="text-[11.5px] text-danger">{estado}</span>
          ) : null
        }
      >
        Datos del proceso
      </SectionTitle>

      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
        <label className="text-[12.5px] text-muted sm:col-span-2">
          Objeto de la contratación
          <input
            defaultValue={proceso.objeto ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (proceso.objeto ?? "")) autosave({ objeto: v || null });
            }}
            className={`${inputBase} mt-1`}
          />
        </label>

        <label className="text-[12.5px] text-muted">
          Entidad convocante
          <select
            defaultValue={proceso.institucion_id ?? ""}
            onChange={(e) => autosave({ institucion_id: e.target.value || null })}
            className={`${inputBase} mt-1`}
          >
            <option value="">— Sin entidad —</option>
            {instituciones.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[12.5px] text-muted">
          Cierre (fecha y hora)
          <input
            type="datetime-local"
            defaultValue={proceso.cierre ? proceso.cierre.slice(0, 16) : ""}
            onBlur={(e) => {
              const v = e.target.value || null;
              if (v !== (proceso.cierre?.slice(0, 16) ?? null)) autosave({ cierre: v });
            }}
            className={`${inputBase} mt-1`}
          />
        </label>

        <label className="text-[12.5px] text-muted">
          Modalidad
          <select
            defaultValue={proceso.modalidad}
            onChange={(e) => autosave({ modalidad: e.target.value })}
            className={`${inputBase} mt-1`}
          >
            {Object.entries(MODALIDAD_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[12.5px] text-muted">
          Adjudicación
          <select
            defaultValue={proceso.adjudicacion}
            onChange={(e) =>
              autosave({ adjudicacion: e.target.value as LicProceso["adjudicacion"] })
            }
            className={`${inputBase} mt-1`}
          >
            <option value="total">Total</option>
            <option value="lote">Por lote</option>
            <option value="item">Por ítem</option>
          </select>
        </label>

        <label className="text-[12.5px] text-muted">
          Criterio
          <select
            defaultValue={proceso.criterio}
            onChange={(e) =>
              autosave({ criterio: e.target.value as LicProceso["criterio"] })
            }
            className={`${inputBase} mt-1`}
          >
            <option value="menor_precio">Menor precio</option>
            <option value="calidad_precio">Calidad y precio</option>
            <option value="calidad">Calidad</option>
          </select>
        </label>

        <label className="text-[12.5px] text-muted">
          Plazo de pago (días)
          <input
            type="number"
            min={0}
            defaultValue={proceso.plazo_pago_dias ?? ""}
            onBlur={(e) => {
              const v = e.target.value === "" ? null : Number(e.target.value);
              if (v !== proceso.plazo_pago_dias) autosave({ plazo_pago_dias: v });
            }}
            className={`${inputBase} mt-1 text-right font-mono`}
          />
        </label>

        <label className="text-[12.5px] text-muted">
          Tasa USD→DOP de ESTE proceso
          <input
            type="number"
            step="0.01"
            placeholder="hereda de Empresa"
            defaultValue={proceso.tasa_usd_dop ?? ""}
            onBlur={(e) => {
              const v = e.target.value === "" ? null : Number(e.target.value);
              if (v !== proceso.tasa_usd_dop) autosave({ tasa_usd_dop: v });
            }}
            className={`${inputBase} mt-1 text-right font-mono`}
          />
        </label>

        <label className="text-[12.5px] text-muted">
          Margen % de ESTE proceso
          <input
            type="number"
            step="0.1"
            placeholder="hereda de Empresa"
            defaultValue={proceso.margen_pct ?? ""}
            onBlur={(e) => {
              const v = e.target.value === "" ? null : Number(e.target.value);
              if (v !== proceso.margen_pct) autosave({ margen_pct: v });
            }}
            className={`${inputBase} mt-1 text-right font-mono`}
          />
        </label>

        <label className="text-[12.5px] text-muted sm:col-span-2 xl:col-span-3">
          Notas
          <textarea
            rows={2}
            defaultValue={proceso.notas ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (proceso.notas ?? "")) autosave({ notas: v || null });
            }}
            className={`${inputBase} mt-1 resize-y`}
          />
        </label>
      </div>
    </Panel>
  );
}
