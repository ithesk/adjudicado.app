"use client";

// Las órdenes de compra que salieron de esta licitación — el otro extremo del
// hilo. Y, cuando hay contradicción, la propuesta de resolverla.
//
// La contradicción es esta: si llegó la orden de compra, se ganó. No hay otra
// lectura. Pero el sistema no lo decide por su cuenta — lo propone, y basta
// un clic. Hoy pasa en 3 de las 5 licitaciones enlazadas: una está «en
// captura» con su orden ya entregada y por facturar.

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Package, TriangleAlert } from "lucide-react";
import { Panel, SectionTitle, btnPrimary } from "@/components/ui";
import { avisoError, avisoOk } from "@/lib/avisos";
import { formatRD, ESTADO_LABEL, type Estado } from "@/lib/types";
import { actualizarProcesoAction } from "@/lib/actions/licitaciones";

export interface OrdenDelProceso {
  id: string;
  numero_oc: string | null;
  estado: Estado;
  monto: number | null;
  moneda: string;
}

export default function OrdenesDelProceso({
  procesoId,
  codigo,
  estadoProceso,
  ordenes,
  proponer,
}: {
  procesoId: string;
  codigo: string;
  estadoProceso: string;
  ordenes: OrdenDelProceso[];
  /** Llegó la orden pero la licitación no se da por ganada. */
  proponer: boolean;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  function marcarAdjudicada() {
    startTransition(async () => {
      const error = await actualizarProcesoAction(procesoId, { estado: "adjudicado" });
      if (error) {
        avisoError(error);
        return;
      }
      avisoOk(`${codigo} marcada como adjudicada.`);
      router.refresh();
    });
  }

  if (ordenes.length === 0) return null;

  return (
    <Panel>
      <SectionTitle icon={Package}>
        Órdenes de compra ({ordenes.length})
      </SectionTitle>

      {proponer && (
        <div className="mx-4 mt-3 rounded-md border border-warn/30 bg-warn-soft px-3 py-2.5">
          <p className="flex items-start gap-2 text-[12.5px] leading-snug text-warn">
            <TriangleAlert className="mt-0.5 h-4 w-4 flex-none" strokeWidth={2.2} aria-hidden />
            <span>
              <span className="font-semibold">Llegó la orden de compra, pero esta
              licitación sigue en «{estadoProceso}».</span>{" "}
              Si la entidad ya emitió la orden, se ganó.
            </span>
          </p>
          <button
            type="button"
            onClick={marcarAdjudicada}
            disabled={pendiente}
            className={btnPrimary("mt-2 !px-2.5 !py-1 !text-[12px]")}
          >
            {pendiente ? "Marcando…" : "Marcar como adjudicada"}
          </button>
        </div>
      )}

      <ul className="divide-y divide-line">
        {ordenes.map((o) => (
          <li key={o.id}>
            <Link
              href={`/orden/${o.id}`}
              prefetch={false}
              className="flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[12.5px] font-medium text-ink">
                  {o.numero_oc || "Sin número"}
                </span>
                <span className="block text-[11.5px] text-muted">
                  {ESTADO_LABEL[o.estado]}
                </span>
              </span>
              {o.monto != null && (
                <span className="shrink-0 font-mono text-[12px] text-ink-soft">
                  {formatRD(o.monto, o.moneda)}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
