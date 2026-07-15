"use client";

import Link from "next/link";
import { diasRestantes } from "@/lib/types";
import { nivelUrgencia } from "@/lib/types";
import { urgenciaChip, urgenciaDot, textoDias } from "@/lib/ui";
import {
  ESTADO_LIC_LABEL,
  MODALIDAD_LABEL,
  type LicProceso,
} from "@/lib/licitaciones/tipos";

// El cierre es fecha+hora; el contador de días reusa los helpers del tablero.
function diasAlCierre(cierre: string | null): number | null {
  return diasRestantes(cierre ? cierre.slice(0, 10) : null);
}

const VIVO: Record<string, boolean> = {
  captura: true,
  calificacion: true,
  costeo: true,
  armado: true,
  listo: true,
  sometido: true,
  subsanacion: true,
};

export default function ProcesosLista({ procesos }: { procesos: LicProceso[] }) {
  if (procesos.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
        Crea el primer proceso con «Nuevo proceso»: código del expediente,
        entidad y fecha de cierre. Los ítems y requisitos se cargan después.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-2 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
            <th className="w-[110px] px-3 py-2 font-medium">Cierre</th>
            <th className="px-3 py-2 font-medium">Proceso</th>
            <th className="w-[150px] px-3 py-2 font-medium">Modalidad</th>
            <th className="w-[120px] px-3 py-2 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {procesos.map((p) => {
            const dias = VIVO[p.estado] ? diasAlCierre(p.cierre) : null;
            const nivel = nivelUrgencia(dias);
            return (
              <tr key={p.id} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${urgenciaDot(nivel)}`} aria-hidden />
                    <span className={`rounded px-1.5 py-0.5 font-mono text-xs font-medium ${urgenciaChip(nivel)}`}>
                      {VIVO[p.estado] ? textoDias(dias) : "—"}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <Link href={`/licitaciones/${p.id}`} className="block">
                    <span className="font-mono text-xs font-medium text-ink">{p.codigo}</span>
                    <span className="block truncate text-[12.5px] text-muted">
                      {p.objeto ?? "Sin objeto"}
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-[12.5px] text-ink-soft">
                  {MODALIDAD_LABEL[p.modalidad] ?? p.modalidad}
                </td>
                <td className="px-3 py-2.5">
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-ink">
                    {ESTADO_LIC_LABEL[p.estado]}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
