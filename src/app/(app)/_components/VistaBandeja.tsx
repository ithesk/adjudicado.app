"use client";

// El conmutador Tabla ↔ Tablero de la bandeja. Dos preguntas distintas sobre
// los mismos datos: la tabla dice QUÉ CORRE PRISA (ordenada por urgencia); el
// tablero dice DÓNDE ESTÁ ATASCADO EL TRABAJO.
//
// Existe como componente aparte porque la página es de servidor y el
// conmutador necesita estado. Recibe las dos listas ya calculadas allí:
// la filtrada (para la tabla, que respeta el filtro de la barra de métricas)
// y la completa (para el tablero, donde las columnas YA son los estados y
// filtrar por estado lo dejaría medio vacío sin motivo).

import { useEffect, useState } from "react";
import { Columns3, Rows3 } from "lucide-react";
import TriageTable from "./TriageTable";
import TableroOrdenes from "./TableroOrdenes";
import type { OrdenConItems } from "@/lib/queries";

const LS_VISTA = "bandeja-vista";

export default function VistaBandeja({
  lista,
  todas,
  currentUserId,
  filtroActivo,
}: {
  lista: OrdenConItems[];
  todas: OrdenConItems[];
  currentUserId?: string;
  filtroActivo?: string;
}) {
  const [vista, setVista] = useState<"tabla" | "tablero">("tabla");

  // Se lee tras montar para no desajustar la hidratación (el servidor siempre
  // pinta la tabla), igual que hace el sidebar con su rail.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(LS_VISTA) === "tablero") setVista("tablero");
    } catch {}
  }, []);

  function cambiar(v: "tabla" | "tablero") {
    setVista(v);
    try {
      localStorage.setItem(LS_VISTA, v);
    } catch {}
  }

  return (
    <div className="space-y-2.5">
      <div className="flex justify-end">
        <div className="flex items-center gap-0.5 rounded-md border border-line bg-surface p-0.5">
          {([
            ["tabla", "Tabla", Rows3],
            ["tablero", "Tablero", Columns3],
          ] as const).map(([v, label, Icono]) => (
            <button
              key={v}
              type="button"
              onClick={() => cambiar(v)}
              aria-pressed={vista === v}
              title={
                v === "tabla"
                  ? "Ver como tabla ordenable"
                  : "Ver como tablero por estado — arrastra una orden para moverla"
              }
              className={`flex items-center gap-1.5 rounded px-2 py-1 text-[12.5px] font-medium transition-colors ${
                vista === v ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"
              }`}
            >
              <Icono className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
              <span className="max-sm:sr-only">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {vista === "tablero" ? (
        <TableroOrdenes ordenes={todas} currentUserId={currentUserId} />
      ) : (
        <TriageTable
          ordenes={lista}
          controls
          currentUserId={currentUserId}
          filtroActivo={filtroActivo}
        />
      )}
    </div>
  );
}
