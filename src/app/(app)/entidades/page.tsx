import Link from "next/link";
import { Landmark } from "lucide-react";
import { Panel } from "@/components/ui";
import { listarEntidadesResumen } from "@/lib/entidades/queries";
import NuevaEntidad from "./NuevaEntidad";

export const dynamic = "force-dynamic";

export default async function EntidadesPage() {
  const entidades = await listarEntidadesResumen();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-ink">Entidades</h1>
          <p className="text-[13px] text-muted">
            El catálogo único que enlazan las órdenes y las licitaciones — cada
            entidad con su ficha, contactos, asignación y bitácora.
          </p>
        </div>
        <NuevaEntidad />
      </div>

      {entidades.length === 0 ? (
        <Panel className="p-8 text-center text-sm text-muted">
          Sin entidades todavía. Se crean aquí, o solas al subir una orden o un
          proceso.
        </Panel>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {entidades.map((e) => (
            <Link
              key={e.id}
              href={`/entidades/${e.id}`}
              className="group rounded-lg border border-line bg-surface p-3.5 transition-colors hover:border-primary/40"
            >
              <div className="flex items-center gap-3">
                {e.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={e.logo}
                    alt=""
                    className="h-10 w-10 flex-none rounded-md border border-line bg-white object-contain p-0.5"
                  />
                ) : (
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-md bg-surface-2 text-muted">
                    <Landmark className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium text-ink group-hover:text-primary">
                    {e.siglas ? `${e.siglas} — ` : ""}
                    {e.nombre}
                  </p>
                  <p className="truncate font-mono text-[11.5px] text-muted">
                    {e.rnc ? `RNC ${e.rnc}` : "sin RNC"}
                    {e.telefono ? ` · ${e.telefono}` : ""}
                  </p>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-muted">
                  {e.ordenes} orden{e.ordenes === 1 ? "" : "es"}
                </span>
                <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-muted">
                  {e.procesos} proceso{e.procesos === 1 ? "" : "s"}
                </span>
                {e.asignados.map((a) => (
                  <span
                    key={a}
                    className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
