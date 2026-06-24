import Link from "next/link";
import { X } from "lucide-react";
import { calcularMetricas, listarActividad, listarOrdenes } from "@/lib/queries";
import { getMiembro } from "@/lib/auth";
import { ESTADO_LABEL, esViva, type Estado } from "@/lib/types";
import MetricBar from "./_components/MetricBar";
import TriageTable from "./_components/TriageTable";
import ActividadReciente from "./_components/ActividadReciente";

export const dynamic = "force-dynamic";

export default async function TableroPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const filtro = estado as Estado | undefined;
  const ordenes = await listarOrdenes();
  const miembro = await getMiembro();
  const metricas = calcularMetricas(ordenes);
  const actividad = await listarActividad();

  const vivas = filtro
    ? ordenes.filter((o) => o.estado === filtro)
    : ordenes.filter((o) => esViva(o.estado));
  const cerradas = filtro ? [] : ordenes.filter((o) => !esViva(o.estado));

  return (
    <div className="space-y-6">
      <MetricBar m={metricas} />

      {!filtro && <ActividadReciente actividad={actividad} />}

      {ordenes.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <section className="space-y-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-muted">
                {filtro ? (
                  <>
                    <span className="text-ink">{ESTADO_LABEL[filtro]}</span>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">{vivas.length}</span>
                    <Link
                      href="/"
                      className="inline-flex items-center gap-0.5 rounded-full bg-surface-2 px-1.5 py-0.5 normal-case tracking-normal text-muted transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                      quitar filtro
                    </Link>
                  </>
                ) : (
                  <>
                    Órdenes vivas <span aria-hidden>·</span>{" "}
                    <span className="tabular-nums">{vivas.length}</span>
                  </>
                )}
              </h2>
              <span className="text-xs text-muted">
                Ordena por cualquier columna y filtra al instante
              </span>
            </div>
            {vivas.length === 0 ? (
              <p className="rounded-md border border-dashed border-line p-6 text-center text-sm text-muted">
                {filtro ? "No hay órdenes en este estado." : "No hay órdenes vivas."}
              </p>
            ) : (
              <TriageTable
                ordenes={vivas}
                controls
                currentUserId={miembro?.user_id}
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
