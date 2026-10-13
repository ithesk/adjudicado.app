import Link from "next/link";
import { Plus } from "lucide-react";
import { listarActividad, listarOrdenes } from "@/lib/queries";
import { CabeceraPagina, Hoja, btnPrimary } from "@/components/ui";
import { getMiembro } from "@/lib/auth";
import { ESTADO_LABEL, esViva, normalizarEntidad, type Estado } from "@/lib/types";
import { metricaPorKey } from "@/lib/metricas";
import {
  listarProcesos,
  montosDeProcesos,
  perfilEmpresa,
  subsanacionesAbiertas,
} from "@/lib/licitaciones/queries";
import { listarEntidadesLigero } from "@/lib/entidades/queries";
import { resumenLicitaciones } from "@/lib/licitaciones/resumen";
import MetricBar from "./_components/MetricBar";
import TriageTable from "./_components/TriageTable";
import VistaBandeja from "./_components/VistaBandeja";
import ActividadReciente from "./_components/ActividadReciente";
import DondeEstaElDinero from "./_components/DondeEstaElDinero";
import QuienNosDebe from "./_components/QuienNosDebe";
import LicitacionesEnCurso from "./_components/LicitacionesEnCurso";

export const dynamic = "force-dynamic";

export default async function TableroPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; filtro?: string; institucion?: string }>;
}) {
  const { estado, filtro, institucion } = await searchParams;
  // Todo en paralelo: la bandeja ya cuenta las dos mitades del trabajo
  // (órdenes y licitaciones) y en fila sumaría las latencias.
  const [ordenes, miembro, actividad, procesos, perfil, subsanaciones, entidades] =
    await Promise.all([
      listarOrdenes(),
      getMiembro(),
      listarActividad(),
      listarProcesos(),
      perfilEmpresa(),
      subsanacionesAbiertas(),
      listarEntidadesLigero(),
    ]);
  const montos = await montosDeProcesos(procesos, perfil?.itbis_pct ?? 18);
  const resumenLic = resumenLicitaciones({ procesos, montos, subsanaciones });
  const entidadPorId = Object.fromEntries(
    entidades.map((e) => [e.id, { nombre: e.nombre, siglas: e.siglas }]),
  );

  // El filtro puede venir de una métrica (?filtro=), de un estado (?estado=)
  // o de una institución (?institucion=, desde «Quién nos debe»: sus
  // órdenes vivas).
  const metrica = metricaPorKey(filtro);
  const hayFiltro = Boolean(metrica || estado || institucion);
  const titulo = metrica
    ? metrica.label
    : estado
      ? ESTADO_LABEL[estado as Estado]
      : institucion
        ? institucion
        : "Órdenes vivas";
  const lista = metrica
    ? ordenes.filter(metrica.predicado)
    : estado
      ? ordenes.filter((o) => o.estado === estado)
      : institucion
        ? ordenes.filter(
            (o) =>
              esViva(o.estado) &&
              normalizarEntidad(o.institucion ?? "Sin institución") === normalizarEntidad(institucion),
          )
        : ordenes.filter((o) => esViva(o.estado));
  const cerradas = hayFiltro ? [] : ordenes.filter((o) => !esViva(o.estado));

  return (
    // "mesa": las dos tablas donde se vive el día (bandeja y licitaciones)
    // comparten ancho a propósito — dos anchos distintos se ven peor que uno
    // estrecho en las dos.
    <Hoja ancho="mesa" className="space-y-6">
      <CabeceraPagina
        titulo="Bandeja"
        descripcion={`${lista.length} orden${lista.length === 1 ? "" : "es"} ${
          institucion
            ? `vivas de ${titulo}`
            : hayFiltro
              ? `en ${titulo.toLowerCase()}`
              : "vivas"
        } — el trabajo del día, ordenado por urgencia.`}
        acciones={
          <Link href="/orden/nueva" className={btnPrimary()}>
            <Plus className="h-4 w-4" strokeWidth={2.4} aria-hidden />
            Nueva orden
          </Link>
        }
      />
      <MetricBar ordenes={ordenes} />

      {/* Los dos bloques de inteligencia (dónde está el dinero y las
          licitaciones con reloj) solo sin filtro: con uno puesto, la persona
          vino a ver UNA lista y lo demás la aleja de ella. */}
      {!hayFiltro && (ordenes.length > 0 || procesos.length > 0) && (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <DondeEstaElDinero ordenes={ordenes} metaAnual={perfil?.meta_anual ?? null} />
            <LicitacionesEnCurso resumen={resumenLic} entidades={entidadPorId} />
          </div>
          <QuienNosDebe ordenes={ordenes} />
        </>
      )}

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
              // El tablero recibe TODAS las órdenes, no la lista filtrada: sus
              // columnas ya son los estados, y un filtro por estado lo dejaría
              // con una sola columna con algo dentro.
              <VistaBandeja
                lista={lista}
                todas={ordenes}
                currentUserId={miembro?.user_id}
                filtroActivo={hayFiltro ? titulo : undefined}
              />
            )}
          </section>

          {/* La actividad va DESPUÉS de la mesa de trabajo: es contexto,
              no la tarea — antes empujaba la tabla de órdenes abajo. Se capa
              a ancho de feed: es prosa, y a 1600px la línea sería ilegible
              aunque la tabla de arriba sí aproveche todo el ancho. */}
          {!hayFiltro && (
            <div className="max-w-3xl">
              <ActividadReciente actividad={actividad} />
            </div>
          )}

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
    </Hoja>
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
