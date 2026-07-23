"use client";

// Lista de plantillas con VARIANTES por entidad. Dos bloques:
// (1) Plantillas propias de la organización (códigos suyos), con la genérica
//     encabezando y sus variantes debajo con la etiqueta de la entidad.
// (2) Formularios del sistema (F.033, cartas…): el sistema los trae listos,
//     pero si una entidad exige SU versión (caso MITUR), «Variante» sube el
//     Word que esa entidad envió y al generar gana sobre el del sistema.

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CornerDownRight, CopyPlus, FileStack, Landmark, Paperclip, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Panel, SectionTitle, btnPrimary, inputBase } from "@/components/ui";
import {
  crearPlantillaAction,
  crearVariantePlantillaAction,
  eliminarPlantillaAction,
  reemplazarArchivoPlantillaAction,
} from "@/lib/actions/plantillas";
import type { LicPlantilla } from "@/lib/licitaciones/queries-plantillas";

interface EntidadLigera {
  id: string;
  nombre: string;
  siglas: string | null;
}

interface PlantillaSistema {
  codigo: string;
  nombre: string;
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

function SelectorEntidad({
  entidades,
  ...props
}: { entidades: EntidadLigera[] } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${inputBase} !w-auto !py-1 text-[12.5px]`}>
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
  );
}

function FilaPlantilla({
  plantilla,
  entidades,
  ocupado,
  onVariante,
  onReemplazar,
  onEliminar,
}: {
  plantilla: LicPlantilla;
  entidades: EntidadLigera[];
  ocupado: boolean;
  onVariante: (plantillaId: string, institucionId: string) => void;
  onReemplazar: (plantilla: LicPlantilla, archivo: File) => void;
  onEliminar: (plantilla: LicPlantilla) => void;
}) {
  const [eligiendo, setEligiendo] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);
  const esVariante = Boolean(plantilla.institucion_id);
  return (
    <li className={esVariante ? "bg-surface-2/40" : ""}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
        {esVariante && (
          <CornerDownRight className="h-3.5 w-3.5 flex-none text-muted" strokeWidth={2} aria-hidden />
        )}
        <span
          className={`h-2 w-2 flex-none rounded-full ${plantilla.estado === "lista" ? "bg-ok" : "bg-warn"}`}
          title={plantilla.estado === "lista" ? "Lista para generar" : "Borrador"}
          aria-hidden
        />
        <div className="min-w-52 flex-1">
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
        <input
          ref={archivoRef}
          type="file"
          accept=".docx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (
              confirm(
                `¿Reemplazar el Word de "${plantilla.nombre}" por el archivo elegido?\n\nLas variables ya arrastradas se limpian y la plantilla vuelve a borrador para taggear el documento nuevo.`,
              )
            )
              onReemplazar(plantilla, f);
          }}
        />
        <button
          type="button"
          onClick={() => archivoRef.current?.click()}
          disabled={ocupado}
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[12px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          title={
            esVariante
              ? "Sube el Word que envió la entidad — sustituye la copia con la que nació esta variante"
              : "Sube otro Word sobre esta plantilla"
          }
        >
          <Paperclip className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Word
        </button>
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
          <SelectorEntidad
            entidades={entidades}
            defaultValue=""
            disabled={ocupado}
            onChange={(e) => {
              if (e.target.value) onVariante(plantilla.id, e.target.value);
            }}
          />
          <p className="text-[11.5px] text-muted">
            Se copia ya construida; edita solo lo que esa entidad cambió.
          </p>
        </div>
      )}
    </li>
  );
}

// Un formulario del sistema: siempre listo, y debajo sus variantes (si una
// entidad exige su propia versión, se sube el archivo QUE ELLA ENVIÓ).
function FilaSistema({
  doc,
  variantes,
  entidades,
  ocupado,
  onSubir,
  onVariante,
  onReemplazar,
  onEliminar,
}: {
  doc: PlantillaSistema;
  variantes: LicPlantilla[];
  entidades: EntidadLigera[];
  ocupado: boolean;
  onSubir: (fd: FormData) => void;
  onVariante: (plantillaId: string, institucionId: string) => void;
  onReemplazar: (plantilla: LicPlantilla, archivo: File) => void;
  onEliminar: (plantilla: LicPlantilla) => void;
}) {
  const [eligiendo, setEligiendo] = useState(false);
  return (
    <>
      <li>
        <div className="flex items-center gap-3 px-4 py-2.5">
          <ShieldCheck className="h-4 w-4 flex-none text-ok" strokeWidth={2} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ink">{doc.nombre}</p>
            <p className="truncate text-[11.5px] text-muted">
              <span className="font-mono">{doc.codigo}</span> · lo trae el sistema, siempre listo
            </p>
          </div>
          {entidades.length > 0 && (
            <button
              type="button"
              onClick={() => setEligiendo((v) => !v)}
              disabled={ocupado}
              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[12px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              title="Una entidad exige su propia versión: sube el Word que ella envió"
            >
              <CopyPlus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Variante
            </button>
          )}
        </div>
        {eligiendo && (
          <form
            action={(fd) => {
              fd.set("codigo", doc.codigo);
              fd.set("nombre", doc.nombre);
              onSubir(fd);
            }}
            className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2/60 px-4 py-2 pl-9"
          >
            <p className="text-[12px] text-muted">Versión de {doc.codigo} para:</p>
            <SelectorEntidad name="institucion_id" entidades={entidades} defaultValue="" required disabled={ocupado} />
            <input
              type="file"
              name="archivo"
              required
              accept=".docx"
              className={`${inputBase} !w-auto !py-1 text-[12px] file:mr-2 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-0.5 file:text-[11.5px]`}
            />
            <button type="submit" disabled={ocupado} className={btnPrimary("!px-2.5 !py-1 !text-[12px]")}>
              {ocupado ? "Subiendo…" : "Subir y taggear"}
            </button>
            <p className="w-full text-[11.5px] text-muted">
              Sube el Word tal cual lo envió la entidad; después arrastra las
              variables sobre sus huecos. Al generar un proceso de esa entidad,
              esta versión gana sobre la del sistema.
            </p>
          </form>
        )}
      </li>
      {variantes.map((v) => (
        <FilaPlantilla
          key={v.id}
          plantilla={v}
          entidades={entidades}
          ocupado={ocupado}
          onVariante={onVariante}
          onReemplazar={onReemplazar}
          onEliminar={onEliminar}
        />
      ))}
    </>
  );
}

export default function PlantillasLista({
  plantillas,
  entidades,
  sistema,
}: {
  plantillas: LicPlantilla[];
  entidades: EntidadLigera[];
  sistema: PlantillaSistema[];
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

  function reemplazar(p: LicPlantilla, archivo: File) {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("archivo", archivo);
      const err = await reemplazarArchivoPlantillaAction(p.id, fd);
      if (err) setError(err);
      // Directo al editor: toca arrastrar las variables sobre el Word nuevo.
      else router.push(`/configuracion/plantillas/${p.id}`);
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

  // Los códigos del sistema viven en su bloque (con sus variantes debajo);
  // el bloque de la organización queda para los códigos propios.
  const codigosSistema = new Set(sistema.map((s) => s.codigo));
  const propias = ordenarConVariantes(plantillas.filter((p) => !codigosSistema.has(p.codigo)));
  const variantesDeSistema = (codigo: string) =>
    plantillas.filter((p) => p.codigo === codigo);

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
          Plantillas de la organización ({propias.length})
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
          {propias.map((p) => (
            <FilaPlantilla
              key={p.id}
              plantilla={p}
              entidades={entidades}
              ocupado={pendiente}
              onVariante={crearVariante}
              onReemplazar={reemplazar}
              onEliminar={eliminar}
            />
          ))}
          {propias.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-muted">
              Sube el primer Word — por ejemplo un formulario interno de una
              entidad — y arrastra las variables sobre sus huecos.
            </li>
          )}
        </ul>
      </Panel>

      <Panel>
        <SectionTitle icon={ShieldCheck}>
          Formularios del sistema ({sistema.length})
        </SectionTitle>
        <p className="border-b border-line px-4 py-2 text-[11.5px] text-muted">
          Vienen incluidos y se generan solos. Si una entidad te envió su propia
          versión (p. ej. para una subsanación), crea su «Variante» con ese
          archivo — al generar procesos de esa entidad, gana la suya.
        </p>
        <ul className="divide-y divide-line">
          {sistema.map((doc) => (
            <FilaSistema
              key={doc.codigo}
              doc={doc}
              variantes={variantesDeSistema(doc.codigo)}
              entidades={entidades}
              ocupado={pendiente}
              onSubir={subir}
              onVariante={crearVariante}
              onReemplazar={reemplazar}
              onEliminar={eliminar}
            />
          ))}
        </ul>
      </Panel>
    </div>
  );
}
