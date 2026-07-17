import Link from "next/link";
import { ChevronRight, Landmark } from "lucide-react";
import { CabeceraPagina, Hoja, Panel } from "@/components/ui";
import { listarEntidadesResumen } from "@/lib/entidades/queries";
import NuevaEntidad from "./NuevaEntidad";

export const dynamic = "force-dynamic";

// Catálogo denso estilo ERP: una fila por entidad, columnas con ancho según
// contenido, todo clicable hacia la ficha. Nada de tarjetas desparramadas.
export default async function EntidadesPage() {
  const entidades = await listarEntidadesResumen();

  return (
    <Hoja ancho="ficha" className="space-y-4">
      <CabeceraPagina
        titulo="Entidades"
        descripcion="El catálogo único que enlazan las órdenes y las licitaciones — cada entidad con su ficha, contactos, asignación y bitácora."
        acciones={<NuevaEntidad />}
      />

      {entidades.length === 0 ? (
        <Panel className="p-8 text-center text-sm text-muted">
          Sin entidades todavía. Se crean aquí, o solas al subir una orden o un
          proceso.
        </Panel>
      ) : (
        <Panel>
          <div className="hidden gap-3 border-b border-line px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted sm:grid sm:grid-cols-[2.25rem_minmax(0,1fr)_9rem_5.5rem_5.5rem_minmax(0,12rem)_1rem]">
            <span />
            <span>Entidad</span>
            <span>RNC</span>
            <span className="text-right">Procesos</span>
            <span className="text-right">Órdenes</span>
            <span>La atiende</span>
            <span />
          </div>
          <ul className="divide-y divide-line">
            {entidades.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/entidades/${e.id}`}
                  className="group grid items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-2 sm:grid-cols-[2.25rem_minmax(0,1fr)_9rem_5.5rem_5.5rem_minmax(0,12rem)_1rem]"
                >
                  {e.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={e.logo}
                      alt=""
                      className="h-8 w-8 rounded-md border border-line bg-white object-contain p-0.5"
                    />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-2 text-muted">
                      <Landmark className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-ink group-hover:text-primary">
                      {e.siglas ? `${e.siglas} — ` : ""}
                      {e.nombre}
                    </span>
                    {e.telefono && (
                      <span className="block truncate font-mono text-[11px] text-muted">
                        {e.telefono}
                      </span>
                    )}
                  </span>
                  <span className="hidden truncate font-mono text-[12px] text-muted sm:block">
                    {e.rnc ?? "—"}
                  </span>
                  <span className="hidden text-right font-mono text-[12px] tabular-nums text-ink-soft sm:block">
                    {e.procesos}
                  </span>
                  <span className="hidden text-right font-mono text-[12px] tabular-nums text-ink-soft sm:block">
                    {e.ordenes}
                  </span>
                  <span className="hidden min-w-0 flex-wrap gap-1 sm:flex">
                    {e.asignados.length === 0 ? (
                      <span className="text-[11.5px] text-muted">—</span>
                    ) : (
                      e.asignados.map((a) => (
                        <span
                          key={a}
                          className="truncate rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                        >
                          {a}
                        </span>
                      ))
                    )}
                  </span>
                  <ChevronRight
                    className="hidden h-3.5 w-3.5 text-muted opacity-0 transition-opacity group-hover:opacity-100 sm:block"
                    strokeWidth={2}
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </Hoja>
  );
}
