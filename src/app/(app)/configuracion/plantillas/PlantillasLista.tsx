"use client";

// Lista de plantillas con VARIANTES por entidad: la genérica encabeza y sus
// variantes cuelgan debajo con la etiqueta de la entidad. "Variante para una
// entidad…" duplica la plantilla ya construida — solo se edita lo que esa
// entidad cambió, nunca se re-taggea desde cero.

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CornerDownRight, CopyPlus, FileStack, Landmark, Plus, Trash2 } from "lucide-react";
import { Panel, SectionTitle, btnPrimary, inputBase } from "@/components/ui";
import {
  crearPlantillaAction,
  crearVariantePlantillaAction,
  eliminarPlantillaAction,
} from "@/lib/actions/plantillas";
import type { LicPlantilla } from "@/lib/licitaciones/queries-plantillas";

interface EntidadLigera {
  id: string;
  nombre: string;
  siglas: string | null;
}

// Genéricas primero (en su orden), cada una seguida de sus variantes; las
// variantes huérfanas (sin genérica) cierran la lista agrupadas por código.
function ordenarConVariantes(plantillas: LicPlantilla[]): LicPlantilla[] {
  const bases = plantillas.filter((p) => !p.institucion_id);
  const variantes = plantillas.filter((p) => p.institucion_id);
  const usadas = new Set<string>();
  const filas: LicPlantilla[] = [];
  for (const base of bases) {
    filas.push(base);
    for (const v of variantes) {
      if (v.codigo === base.codigo) {
        filas.push(v);
        usadas.add(v.id);
      }
    }
  }
  for (const v of variantes) if (!usadas.has(v.id)) filas.push(v);
  return filas;
}

function FilaPlantilla({
  plantilla,
  entidades,
  ocupado,
  onVariante,
  onEliminar,
}: {
  plantilla: LicPlantilla;
  entidades: EntidadLigera[];
  ocupado: boolean;
  onVariante: (plantillaId: string, institucionId: string) => void;
  onEliminar: (plantilla: LicPlantilla) => void;
}) {
  const [eligiendo, setEligiendo] = useState(false);
  const esVariante = Boolean(plantilla.institucion_id);
  // Entidades que aún no tienen su variante de este código no las sabemos
  // aquí; el server devuelve el error legible si ya existe.
  return (
    <li className={esVariante ? "bg-surface-2/40" : ""}>
      <div className="flex items-center gap-3 px-4 py-2.5">
        {esVariante && (
          <CornerDownRight className="h-3.5 w-3.5 flex-none text-muted" strokeWidth={2} aria-hidden />
        )}
        <span
          className={`h-2 w-2 flex-none rounded-full ${plantilla.estado === "lista" ? "bg-ok" : "bg-warn"}`}
          title={plantilla.estado === "lista" ? "Lista para generar" : "Borrador"}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <Link href={`/configuracion/plantillas/${plantilla.id}`} className="block">
            <p className="flex items-center gap-2 truncate text-[13px] font-medium text-ink">
              <span className="truncate">{plantilla.nombre}</span>
              {plantilla.institucion && (
                <span className="inline-flex flex-none items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10.5px] font-medium text-primary">
                  <Landmark className="h-3 w-3" strokeWidth={2} aria-hidden />
                  {plantilla.institucion.siglas ?? plantilla.institucion.nombre}
                </span>
              )}
            </p>
            <p className="truncate text-[11.5px] text-muted">
              <span className="font-mono">{plantilla.codigo}</span> ·{" "}
              {plantilla.asignaciones.length} variable{plantilla.asignaciones.length === 1 ? "" : "s"} ·{" "}
              {plantilla.estado === "lista" ? "lista" : "borrador"}
              {esVariante && " · solo para esta entidad"}
            </p>
          </Link>
        </div>
        {!esVariante && entidades.length > 0 && (
          <button
            type="button"
            onClick={() => setEligiendo((v) => !v)}
            disabled={ocupado}
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[12px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            title="Crear una variante de esta plantilla para una entidad"
          >
            <CopyPlus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Variante
          </button>
        )}
        <Link
          href={`/configuracion/plantillas/${plantilla.id}`}
          className="text-[12.5px] font-medium text-primary hover:underline"
        >
          Editar
        </Link>
        <button
          type="button"
          onClick={() => onEliminar(plantilla)}
          disabled={ocupado}
          className="rounded p-1 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
          aria-label="Eliminar"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
      {eligiendo && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2/60 px-4 py-2 pl-9">
          <p className="text-[12px] text-muted">Variante de {plantilla.codigo} para:</p>
          <select
            defaultValue=""
            disabled={ocupado}
            onChange={(e) => {
              if (e.target.value) onVariante(plantilla.id, e.target.value);
            }}
            className={`${inputBase} !w-auto !py-1 text-[12.5px]`}
          >
            <option value="" disabled>
              Elige la entidad…
            </option>
            {entidades.map((ent) => (
              <option key={ent.id} value={ent.id}>
                {ent.siglas ? `${ent.siglas} — ` : ""}
                {ent.nombre}
              </option>
            ))}
          </select>
          <p className="text-[11.5px] text-muted">
            Se copia ya construida; edita solo lo que esa entidad cambió.
          </p>
        </div>
      )}
    </li>
  );
}

export default function PlantillasLista({
  plantillas,
  entidades,
}: {
  plantillas: LicPlantilla[];
  entidades: EntidadLigera[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [pendiente, startTransition] = useTransition();

  function subir(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await crearPlantillaAction(fd);
      if (r.error) setError(r.error);
      else if (r.id) router.push(`/configuracion/plantillas/${r.id}`);
    });
  }

  function crearVariante(plantillaId: string, institucionId: string) {
    setError(null);
    startTransition(async () => {
      const r = await crearVariantePlantillaAction(plantillaId, institucionId);
      if (r.error) setError(r.error);
      else if (r.id) router.push(`/configuracion/plantillas/${r.id}`);
    });
  }

  function eliminar(p: LicPlantilla) {
    if (!confirm(`¿Eliminar la plantilla "${p.nombre}"?`)) return;
    startTransition(async () => {
      const err = await eliminarPlantillaAction(p.id);
      if (err) setError(err);
      router.refresh();
    });
  }

  const filas = ordenarConVariantes(plantillas);

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>
      )}

      <Panel>
        <SectionTitle
          icon={FileStack}
          right={
            <button
              type="button"
              onClick={() => setSubiendo((v) => !v)}
              className={btnPrimary("!px-2.5 !py-1 !text-[12.5px]")}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
              Nueva plantilla
            </button>
          }
        >
          Plantillas de la organización ({plantillas.length})
        </SectionTitle>

        {subiendo && (
          <form action={subir} className="grid gap-2 border-b border-line p-3 sm:grid-cols-3">
            <input name="nombre" required placeholder="Nombre (Debida Diligencia CNSS)" className={inputBase} />
            <input name="codigo" required placeholder="Código (DADM-FO-031)" className={`${inputBase} font-mono uppercase`} />
            <input type="file" name="archivo" required accept=".docx" className={`${inputBase} file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-[12px]`} />
            <p className="text-[11.5px] text-muted sm:col-span-2">
              El código enlaza la plantilla con el requisito del checklist. Si una
              entidad exige su propia versión, créala después con «Variante».
            </p>
            <button type="submit" disabled={pendiente} className={btnPrimary("!py-2")}>
              {pendiente ? "Subiendo…" : "Subir y abrir el editor"}
            </button>
          </form>
        )}

        <ul className="divide-y divide-line">
          {filas.map((p) => (
            <FilaPlantilla
              key={p.id}
              plantilla={p}
              entidades={entidades}
              ocupado={pendiente}
              onVariante={crearVariante}
              onEliminar={eliminar}
            />
          ))}
          {plantillas.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-muted">
              Sube el primer Word — por ejemplo un formulario interno de una
              entidad — y arrastra las variables sobre sus huecos.
            </li>
          )}
        </ul>
      </Panel>
    </div>
  );
}
