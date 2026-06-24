import Link from "next/link";
import { listarActividad, listarOrdenes } from "@/lib/queries";
import { getMiembro } from "@/lib/auth";
import { ESTADO_LABEL, esViva, type Estado } from "@/lib/types";
import { metricaPorKey } from "@/lib/metricas";
import MetricBar from "./_components/MetricBar";
import TriageTable from "./_components/TriageTable";
import ActividadReciente from "./_components/ActividadReciente";

export const dynamic = "force-dynamic";

export default async function TableroPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; filtro?: string }>;
}) {
  const { estado, filtro } = await searchParams;
  const ordenes = await listarOrdenes();
  const miembro = await getMiembro();
  const actividad = await listarActividad();

  // El filtro puede venir de una métrica (?filtro=) o de un estado (?estado=).
  const metrica = metricaPorKey(filtro);
  const hayFiltro = Boolean(metrica || estado);
  const titulo = metrica
    ? metrica.label
    : estado
      ? ESTADO_LABEL[estado as Estado]
      : "Órdenes vivas";
  const lista = metrica
    ? ordenes.filter(metrica.predicado)
    : estado
      ? ordenes.filter((o) => o.estado === estado)
      : ordenes.filter((o) => esViva(o.estado));
  const cerradas = hayFiltro ? [] : ordenes.filter((o) => !esViva(o.estado));

  return (
    <div className="space-y-6">
      <MetricBar ordenes={ordenes} />

      {!hayFiltro && <ActividadReciente actividad={actividad} />}

      {ordenes.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <section className="space-y-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-muted">
                <span className="text-ink">{hayFiltro ? titulo : "Órdenes vivas"}</span>
                <span aria-hidden>·</span>
                <span className="tabular-nums">{lista.length}</span>
              </h2>
              <span className="text-xs text-muted">
                Ordena por cualquier columna y combina con el buscador
              </span>
            </div>
            {lista.length === 0 ? (
              <p className="rounded-md border border-dashed border-line p-6 text-center text-sm text-muted">
                {hayFiltro ? "No hay órdenes en este filtro." : "No hay órdenes vivas."}
              </p>
            ) : (
              <TriageTable
                ordenes={lista}
                controls
                currentUserId={miembro?.user_id}
                filtroActivo={hayFiltro ? titulo : undefined}
              />
            )}
          </section>

          {cerradas.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
                Cobradas / cerradas <span aria-hidden>·</span>{" "}
                <span className="tabular-nums">{cerradas.length}</span>
              </h2>
              <TriageTable ordenes={cerradas} apagado />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-line bg-surface p-12 text-center">
      <p className="text-sm text-muted">
        Todavía no hay órdenes. Sube el PDF de una orden de compra para empezar.
      </p>
      <Link
        href="/orden/nueva"
        className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-ink transition-colors hover:bg-primary-hover"
      >
        + Nueva orden
      </Link>
    </div>
  );
}
