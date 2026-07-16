"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileStack, Plus, Trash2 } from "lucide-react";
import { Panel, SectionTitle, btnPrimary, inputBase } from "@/components/ui";
import {
  crearPlantillaAction,
  eliminarPlantillaAction,
} from "@/lib/actions/plantillas";
import type { LicPlantilla } from "@/lib/licitaciones/queries-plantillas";

export default function PlantillasLista({
  plantillas,
}: {
  plantillas: LicPlantilla[];
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
              El código enlaza la plantilla con el requisito del checklist.
            </p>
            <button type="submit" disabled={pendiente} className={btnPrimary("!py-2")}>
              {pendiente ? "Subiendo…" : "Subir y abrir el editor"}
            </button>
          </form>
        )}

        <ul className="divide-y divide-line">
          {plantillas.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              <span
                className={`h-2 w-2 flex-none rounded-full ${p.estado === "lista" ? "bg-ok" : "bg-warn"}`}
                title={p.estado === "lista" ? "Lista para generar" : "Borrador"}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <Link href={`/configuracion/plantillas/${p.id}`} className="block">
                  <p className="truncate text-[13px] font-medium text-ink">{p.nombre}</p>
                  <p className="truncate text-[11.5px] text-muted">
                    <span className="font-mono">{p.codigo}</span> ·{" "}
                    {p.asignaciones.length} variable{p.asignaciones.length === 1 ? "" : "s"} ·{" "}
                    {p.estado === "lista" ? "lista" : "borrador"}
                  </p>
                </Link>
              </div>
              <Link
                href={`/configuracion/plantillas/${p.id}`}
                className="text-[12.5px] font-medium text-primary hover:underline"
              >
                Editar
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`¿Eliminar la plantilla "${p.nombre}"?`))
                    startTransition(async () => {
                      const err = await eliminarPlantillaAction(p.id);
                      if (err) setError(err);
                      router.refresh();
                    });
                }}
                disabled={pendiente}
                className="rounded p-1 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                aria-label="Eliminar"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </li>
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
