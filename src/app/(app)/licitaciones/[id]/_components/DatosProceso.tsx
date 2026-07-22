"use client";

// PASO 0 — Los datos del proceso: la primera parada de la línea de tiempo.
// Todo con autosave (se guarda al salir del campo).

import { FileText } from "lucide-react";
import { IndicadorGuardado, Panel, SectionTitle, inputBase } from "@/components/ui";
import { useAccion } from "@/lib/use-accion";
import { actualizarProcesoAction } from "@/lib/actions/licitaciones";
import { MODALIDAD_LABEL, type LicProceso } from "@/lib/licitaciones/tipos";

export default function DatosProceso({
  proceso,
  instituciones,
}: {
  proceso: LicProceso;
  instituciones: { id: string; nombre: string }[];
}) {
  const { correr, estado } = useAccion();

  function autosave(patch: Parameters<typeof actualizarProcesoAction>[1]) {
    correr("proceso", () => actualizarProcesoAction(proceso.id, patch));
  }

  return (
    <Panel>
      <SectionTitle icon={FileText} right={<IndicadorGuardado estado={estado} />}>
        Datos del proceso
      </SectionTitle>

      {/* Anchos SEGÚN CONTENIDO (regla 3 del sistema): el objeto y la
          entidad son flexibles; fechas y números, a su medida. */}
      <div className="space-y-3 p-4">
        <label className="block text-[12.5px] text-muted">
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

        <div className="flex flex-wrap gap-3">
        <label className="min-w-56 flex-1 text-[12.5px] text-muted">
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

        <label className="w-48 text-[12.5px] text-muted">
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

        <label className="w-52 text-[12.5px] text-muted">
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
        </div>

        <div className="flex flex-wrap gap-3">
        <label className="w-36 text-[12.5px] text-muted">
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

        <label className="w-40 text-[12.5px] text-muted">
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

        <label className="w-28 text-[12.5px] text-muted">
          Plazo pago (días)
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

        <label className="w-32 text-[12.5px] text-muted">
          Tasa USD→DOP
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

        <label className="w-28 text-[12.5px] text-muted">
          Margen %
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
        </div>

        <label className="block text-[12.5px] text-muted">
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
