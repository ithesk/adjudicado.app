// Las licitaciones en la bandeja. La bandeja es «el trabajo del día», y
// hasta ahora solo contaba la mitad: las órdenes. Un pliego que cierra
// mañana o una subsanación con plazo son el mismo trabajo, y había que ir a
// otra pantalla para enterarse. Aquí van los números del embudo (con su
// dinero) y los procesos con el reloj corriendo, del más urgente al más
// holgado.

import Link from "next/link";
import { ArrowUpRight, Gavel, Plus } from "lucide-react";
import { Panel, SectionTitle } from "@/components/ui";
import { formatCorto, formatRD } from "@/lib/types";
import type { ResumenLicitaciones as Resumen } from "@/lib/licitaciones/resumen";
import { MODALIDAD_LABEL } from "@/lib/licitaciones/tipos";
import ResumenLicitaciones from "../licitaciones/_components/ResumenLicitaciones";
import { ChipCierre, ChipEstado } from "../licitaciones/_components/Chips";

// Los que caben sin convertir la bandeja en la lista de licitaciones.
const TOPE = 6;

export default function LicitacionesEnCurso({
  resumen,
  entidades,
}: {
  resumen: Resumen;
  entidades: Record<string, { nombre: string; siglas: string | null }>;
}) {
  const vivos = resumen.vivos.slice(0, TOPE);
  const fuera = resumen.vivos.length - vivos.length;

  return (
    <Panel className="overflow-hidden">
      <SectionTitle
        icon={Gavel}
        right={
          <Link
            href="/licitaciones"
            prefetch={false}
            className="inline-flex items-center gap-0.5 rounded-sm text-[12px] font-medium text-muted transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            Ver todas
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </Link>
        }
      >
        Licitaciones
      </SectionTitle>

      <div className="border-b border-line">
        <ResumenLicitaciones r={resumen} marco={false} />
      </div>

      {vivos.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-[13px] text-muted">No hay licitaciones en curso.</p>
          <Link
            href="/licitaciones/nuevo"
            prefetch={false}
            className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
            Nuevo proceso
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {vivos.map((v) => {
            const ent = v.institucion_id ? entidades[v.institucion_id] : null;
            return (
              <li key={v.id}>
                <Link
                  href={`/licitaciones/${v.id}`}
                  prefetch={false}
                  className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]"
                >
                  <span className="w-[88px] shrink-0">
                    {v.dias !== null ? (
                      <ChipCierre dias={v.dias} nivel={v.nivel} esSub={Boolean(v.subsanacion)} />
                    ) : (
                      // Sometido sin subsanación: la decisión es de la entidad.
                      <span className="pl-3.5 text-[11px] text-muted">esperando</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 truncate font-mono text-[12.5px] font-medium text-ink">
                        {v.codigo}
                      </span>
                      <span
                        className="shrink-0 rounded bg-surface-2 px-1 py-px font-mono text-[10px] font-medium uppercase text-muted"
                        title={MODALIDAD_LABEL[v.modalidad] ?? v.modalidad}
                      >
                        {v.modalidad}
                      </span>
                      {v.subsanacion && (
                        <span className="shrink-0 rounded bg-warn-soft px-1 py-px text-[10px] font-semibold uppercase text-warn">
                          Subsana
                        </span>
                      )}
                    </span>
                    <span
                      className="block truncate text-[12px] text-muted"
                      title={v.objeto ?? undefined}
                    >
                      {ent ? `${ent.siglas ?? ent.nombre} · ` : ""}
                      {v.objeto ?? "Sin objeto"}
                    </span>
                  </span>
                  <span className="hidden shrink-0 sm:block">
                    <ChipEstado estado={v.estado} />
                  </span>
                  <span
                    className="w-[84px] shrink-0 text-right font-mono text-[12.5px] tabular-nums"
                    title={v.monto !== null ? formatRD(v.monto) : "Sin cotizar"}
                  >
                    {v.monto !== null ? (
                      <span className="text-ink">{formatCorto(v.monto)}</span>
                    ) : (
                      <span className="text-[11px] text-muted">sin cotizar</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
          {fuera > 0 && (
            <li>
              <Link
                href="/licitaciones?filtro=trabajo"
                prefetch={false}
                className="block px-4 py-2 text-center text-[12px] font-medium text-muted transition-colors hover:text-primary"
              >
                {fuera} más en curso
              </Link>
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}
