"use client";

// La bandeja como TABLERO: las órdenes en columnas por estado. La tabla dice
// qué corre prisa; el tablero dice dónde está atascado el trabajo.
//
// Arrastrar una tarjeta cambia el estado de la orden — la misma operación que
// el control de estado de la ficha, sin entrar a la ficha.
//
// Copiado a propósito del tablero de licitaciones en vez de extraer un
// componente común: con dos tableros ya se ve qué es de verdad idéntico (la
// mecánica de arrastre y el estado optimista) y qué es de cada dominio (las
// columnas, la tarjeta y el guardado). Cuando aparezca el tercero se extrae
// con la forma ya conocida, no adivinada.

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  ESTADOS,
  ESTADO_LABEL,
  diasRestantes,
  formatRD,
  nivelUrgencia,
  plazoDominante,
  type Estado,
} from "@/lib/types";
import { urgenciaChip, urgenciaDot, textoDias } from "@/lib/ui";
import { Avatar } from "@/components/ui";
import { avisoError } from "@/lib/avisos";
import { fijarEstado } from "../orden/[id]/actions";
import type { OrdenConItems } from "@/lib/queries";

// El punto de color de cada estado — mismo lenguaje que el menú lateral.
const PUNTO: Record<Estado, string> = {
  orden_recibida: "bg-muted/50",
  en_coordinacion: "bg-primary",
  entregado: "bg-warn",
  listo_facturar: "bg-warn",
  facturado: "bg-ok",
  libramiento: "bg-primary",
  cobrado: "bg-ok",
  cerrado: "bg-line",
};

// Las terminales acumulan para siempre: se muestran las más recientes y se
// declara cuántas quedan fuera, en vez de pintar cientos de tarjetas muertas.
const TOPE_TERMINAL = 12;
const TERMINAL: Record<string, boolean> = { cobrado: true, cerrado: true };

export default function TableroOrdenes({
  ordenes,
  currentUserId,
}: {
  ordenes: OrdenConItems[];
  currentUserId?: string;
}) {
  const router = useRouter();
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [columnaDestino, setColumnaDestino] = useState<Estado | null>(null);
  // Movimientos soltados que el servidor aún no confirmó: sin esto la tarjeta
  // volvería a su columna hasta el refresh y el arrastre se sentiría roto.
  const [optimista, setOptimista] = useState<Record<string, Estado>>({});

  const estadoDe = (o: OrdenConItems): Estado => optimista[o.id] ?? o.estado;

  async function mover(ordenId: string, destino: Estado) {
    const orden = ordenes.find((o) => o.id === ordenId);
    if (!orden) return;
    const origen = estadoDe(orden);
    if (origen === destino) return;

    setOptimista((prev) => ({ ...prev, [ordenId]: destino }));
    // `origen` es el candado: si la orden ya se movió en otra parte (otra
    // persona, o el cron de Odoo de madrugada), el guardado se rechaza en vez
    // de pisar ese cambio.
    const error = await fijarEstado(ordenId, destino, origen);
    if (error) {
      setOptimista((prev) => {
        const resto = { ...prev };
        delete resto[ordenId];
        return resto;
      });
      avisoError(error);
      return;
    }
    router.refresh();
  }

  return (
    // El scroll horizontal aquí es el idioma del tablero, no un fallo.
    <div className="flex gap-3 overflow-x-auto pb-2">
      {ESTADOS.map((estado) => {
        const enColumna = ordenes.filter((o) => estadoDe(o) === estado);
        const visibles = TERMINAL[estado] ? enColumna.slice(0, TOPE_TERMINAL) : enColumna;
        const ocultas = enColumna.length - visibles.length;
        const esDestino = columnaDestino === estado;
        return (
          <section
            key={estado}
            onDragOver={(e) => {
              if (!arrastrando) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setColumnaDestino(estado);
            }}
            onDragLeave={(e) => {
              // Solo al salir de la columna entera, no al pasar entre tarjetas.
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setColumnaDestino((c) => (c === estado ? null : c));
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              setColumnaDestino(null);
              setArrastrando(null);
              if (id) void mover(id, estado);
            }}
            className={`flex w-[286px] shrink-0 flex-col rounded-lg border bg-surface-2/40 transition-colors ${
              esDestino ? "border-primary bg-primary/5" : "border-line"
            }`}
          >
            <header className="flex items-center gap-2 border-b border-line px-3 py-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${PUNTO[estado]}`} aria-hidden />
              <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                {ESTADO_LABEL[estado]}
              </h3>
              <span className="font-mono text-[11px] text-muted">{enColumna.length}</span>
            </header>

            <div className="flex min-h-24 flex-1 flex-col gap-2 p-2">
              {visibles.map((o) => {
                const dias = diasRestantes(plazoDominante({ ...o, estado: estadoDe(o) }));
                const nivel = nivelUrgencia(dias);
                const items = o.item ?? [];
                // Se cuenta por el flag `entregado`, igual que TriageTable:
                // la bandeja trae un RESUMEN del ítem (sin componentes ni
                // reparto), así que itemEntregado() no aplica aquí — con
                // `tipo` ausente ni siquiera podría resolver su flujo.
                const listos = items.filter((i) => i.entregado).length;
                const enDrag = arrastrando === o.id;
                const mia = currentUserId && o.responsable_id === currentUserId;
                return (
                  <article
                    key={o.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", o.id);
                      e.dataTransfer.effectAllowed = "move";
                      setArrastrando(o.id);
                    }}
                    onDragEnd={() => {
                      setArrastrando(null);
                      setColumnaDestino(null);
                    }}
                    className={`cursor-grab rounded-md border bg-surface p-2.5 shadow-card transition-opacity active:cursor-grabbing ${
                      enDrag ? "opacity-40" : "hover:border-line-strong"
                    } ${mia ? "border-primary/40" : "border-line"}`}
                  >
                    {/* draggable={false}: si no, el navegador arrastra la URL
                        en lugar de la tarjeta. */}
                    <Link
                      href={`/orden/${o.id}`}
                      prefetch={false}
                      draggable={false}
                      className="block min-w-0"
                    >
                      <span className="flex min-w-0 items-baseline gap-1.5">
                        <span className="min-w-0 truncate font-mono text-[11.5px] font-medium text-ink">
                          {o.numero_oc || "Sin número"}
                        </span>
                        {o.monto != null && (
                          <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-soft">
                            {formatRD(o.monto, o.moneda)}
                          </span>
                        )}
                      </span>

                      <span className="mt-1 line-clamp-2 block text-[12px] leading-snug text-ink-soft">
                        {o.institucion || "Sin institución"}
                      </span>

                      <span className="mt-2 flex flex-wrap items-center gap-1.5">
                        {dias !== null && (
                          <span
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10.5px] font-medium ${urgenciaChip(nivel)}`}
                            title="Plazo que manda en este estado"
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${urgenciaDot(nivel)}`}
                              aria-hidden
                            />
                            {textoDias(dias)}
                          </span>
                        )}
                        {items.length > 0 && (
                          <span
                            className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-muted"
                            title={`${listos} de ${items.length} ítems entregados`}
                          >
                            {listos}/{items.length}
                          </span>
                        )}
                        {o.responsable && (
                          <span className="ml-auto shrink-0" title={o.responsable.nombre}>
                            <Avatar nombre={o.responsable.nombre} size={18} />
                          </span>
                        )}
                      </span>
                    </Link>
                  </article>
                );
              })}

              {ocultas > 0 && (
                <p className="px-1 text-center font-mono text-[10.5px] text-muted">
                  +{ocultas} más
                </p>
              )}

              {enColumna.length === 0 && (
                <p className="rounded-md border border-dashed border-line px-2 py-4 text-center text-[11.5px] text-muted">
                  {esDestino ? "Soltar aquí" : "Vacía"}
                </p>
              )}
            </div>

            {estado === "orden_recibida" && (
              <Link
                href="/orden/nueva"
                className="flex items-center gap-1.5 border-t border-line px-3 py-2 text-[12px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
                Nueva orden
              </Link>
            )}
          </section>
        );
      })}
    </div>
  );
}
