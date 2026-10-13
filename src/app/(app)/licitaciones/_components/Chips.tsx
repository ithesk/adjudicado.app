// Los chips de un proceso (reloj y etapa), compartidos por la lista, las
// tarjetas y el bloque de licitaciones de la bandeja. Definirlos una vez
// evita que las presentaciones se desincronicen. Sin estado ni efectos:
// sirven igual desde un componente de servidor o de cliente.

import type { NivelUrgencia } from "@/lib/types";
import { urgenciaChip, urgenciaDot, textoDias } from "@/lib/ui";
import {
  ESTADO_LIC_CHIP,
  ESTADO_LIC_LABEL,
  type EstadoLicitacion,
} from "@/lib/licitaciones/tipos";

export function ChipCierre({
  dias,
  nivel,
  esSub,
}: {
  dias: number | null;
  nivel: NivelUrgencia;
  esSub: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className={`h-2 w-2 shrink-0 rounded-full ${urgenciaDot(nivel)}`} aria-hidden />
      <span
        className={`rounded px-1.5 py-0.5 font-mono text-xs font-medium ${urgenciaChip(nivel)}`}
        title={esSub ? "Fecha límite de la subsanación abierta" : "Cierre del proceso"}
      >
        {textoDias(dias)}
      </span>
    </span>
  );
}

export function ChipEstado({ estado }: { estado: EstadoLicitacion }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${ESTADO_LIC_CHIP[estado].chip}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${ESTADO_LIC_CHIP[estado].dot}`}
        aria-hidden
      />
      {ESTADO_LIC_LABEL[estado]}
    </span>
  );
}
