"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { Panel, SectionTitle, btnPrimary, btnGhost, inputBase } from "@/components/ui";
import SelectorEntidad from "@/components/SelectorEntidad";
import { crearProcesoAction } from "@/lib/actions/licitaciones";
import { MODALIDAD_LABEL } from "@/lib/licitaciones/tipos";

export default function NuevoProcesoForm({
  instituciones,
}: {
  instituciones: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [institucionId, setInstitucionId] = useState("");
  const [nombreEntidad, setNombreEntidad] = useState("");
  const [pendiente, startTransition] = useTransition();

  function crear(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await crearProcesoAction({
        codigo: String(fd.get("codigo") || ""),
        objeto: String(fd.get("objeto") || ""),
        modalidad: String(fd.get("modalidad") || "OTRO"),
        cierre: String(fd.get("cierre") || "") || null,
        institucion_id: institucionId || null,
        institucion_nueva: institucionId ? null : nombreEntidad.trim() || null,
        adjudicacion: (String(fd.get("adjudicacion")) || "total") as
          | "item"
          | "lote"
          | "total",
        criterio: (String(fd.get("criterio")) || "menor_precio") as
          | "menor_precio"
          | "calidad_precio"
          | "calidad",
      });
      if (r.error) setError(r.error);
      else if (r.id) router.push(`/licitaciones/${r.id}`);
    });
  }

  return (
    <Panel className="max-w-2xl">
      <SectionTitle icon={FilePlus2}>Nuevo proceso</SectionTitle>
      <form action={crear} className="grid gap-3 p-4 sm:grid-cols-2">
        {error && (
          <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger sm:col-span-2">
            {error}
          </p>
        )}

        <label className="text-[12.5px] text-muted sm:col-span-2">
          Código del proceso *
          <input
            name="codigo"
            required
            placeholder="MINERD-CCC-LPN-2026-0012"
            className={`${inputBase} mt-1 font-mono`}
          />
        </label>

        <label className="text-[12.5px] text-muted sm:col-span-2">
          Objeto
          <input
            name="objeto"
            placeholder="Adquisición de…"
            className={`${inputBase} mt-1`}
          />
        </label>

        <div className="text-[12.5px] text-muted sm:col-span-2">
          Entidad convocante
          <div className="mt-1">
            <SelectorEntidad
              entidades={instituciones}
              valorId={institucionId}
              texto={nombreEntidad}
              permitirNueva
              onElegir={(id, nombre) => {
                setInstitucionId(id);
                setNombreEntidad(nombre);
              }}
              onTexto={(t) => {
                setInstitucionId("");
                setNombreEntidad(t);
              }}
            />
          </div>
          <span className="mt-1 block text-[11px]">
            Escribe para buscar — mayúsculas, acentos y faltas leves dan igual.
            Si no está, se crea con ese nombre.
          </span>
        </div>

        <label className="text-[12.5px] text-muted">
          Cierre (fecha y hora) *
          <input
            type="datetime-local"
            name="cierre"
            required
            className={`${inputBase} mt-1`}
          />
        </label>

        <label className="text-[12.5px] text-muted">
          Modalidad
          <select name="modalidad" defaultValue="CP" className={`${inputBase} mt-1`}>
            {Object.entries(MODALIDAD_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[12.5px] text-muted">
          Adjudicación
          <select name="adjudicacion" defaultValue="total" className={`${inputBase} mt-1`}>
            <option value="total">Total</option>
            <option value="lote">Por lote</option>
            <option value="item">Por ítem</option>
          </select>
        </label>

        <label className="text-[12.5px] text-muted">
          Criterio
          <select name="criterio" defaultValue="menor_precio" className={`${inputBase} mt-1`}>
            <option value="menor_precio">Menor precio</option>
            <option value="calidad_precio">Calidad y precio</option>
            <option value="calidad">Calidad</option>
          </select>
        </label>

        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" disabled={pendiente} className={btnPrimary()}>
            {pendiente ? "Creando…" : "Crear proceso"}
          </button>
          <button type="button" onClick={() => router.back()} className={btnGhost()}>
            Cancelar
          </button>
        </div>
      </form>
    </Panel>
  );
}
