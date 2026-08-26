"use client";

// El TABLERO: las licitaciones como tarjetas en columnas por etapa. La misma
// información que la tabla, contada de otra forma — la tabla responde «qué
// corre prisa», el tablero responde «cómo va el embudo».
//
// Aquí la etapa deja de ser un adorno: ARRASTRAR UNA TARJETA ES AVANZARLA.
// Antes, cambiar de etapa era clicar en una línea de tiempo que no producía
// ningún cambio visible; en el tablero el cambio ES el movimiento.
//
// Sin librería de drag and drop: HTML5 nativo, igual que el reordenado de
// líneas del cotizador. Una dependencia menos que mantener.

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { diasRestantes, nivelUrgencia } from "@/lib/types";
import { urgenciaChip, urgenciaDot, textoDias } from "@/lib/ui";
import { avisoError } from "@/lib/avisos";
import { actualizarProcesoAction } from "@/lib/actions/licitaciones";
import {
  ESTADO_LIC_CHIP,
  ESTADO_LIC_DESCRIPCION,
  ESTADO_LIC_LABEL,
  MODALIDAD_LABEL,
  type EstadoLicitacion,
  type LicProceso,
} from "@/lib/licitaciones/tipos";

interface EntidadMini {
  nombre: string;
  siglas: string | null;
}

// El camino feliz SIEMPRE se pinta, aunque esté vacío: una columna vacía es
// información («no hay nada en costeo») y hace falta como destino donde
// soltar. Adjudicada y Perdida cierran el embudo.
const COLUMNAS_FIJAS: EstadoLicitacion[] = [
  "captura",
  "calificacion",
  "costeo",
  "armado",
  "listo",
  "sometido",
  "adjudicado",
  "perdido",
];

// Estas dos son desvíos, no etapas del camino: solo aparecen si hay algo en
// ellas, para no arrastrar dos columnas muertas por toda la pantalla.
const COLUMNAS_SI_HAY: EstadoLicitacion[] = ["subsanacion", "descartado"];

// El reloj vive mientras la licitación esté en juego.
const VIVO: Record<string, boolean> = {
  captura: true,
  calificacion: true,
  costeo: true,
  armado: true,
  listo: true,
  sometido: true,
  subsanacion: true,
};

function diasAlCierre(cierre: string | null): number | null {
  return diasRestantes(cierre ? cierre.slice(0, 10) : null);
}

export default function TableroLicitaciones({
  procesos,
  subsanaciones = {},
  entidades = {},
}: {
  procesos: LicProceso[];
  subsanaciones?: Record<string, string>;
  entidades?: Record<string, EntidadMini>;
}) {
  const router = useRouter();
  // Qué se está arrastrando y sobre qué columna está.
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [columnaDestino, setColumnaDestino] = useState<EstadoLicitacion | null>(null);
  // Movimientos ya soltados que el servidor todavía no ha confirmado. Sin
  // esto la tarjeta volvería a su columna hasta que llegara el refresh, y el
  // arrastre se sentiría roto.
  const [optimista, setOptimista] = useState<Record<string, EstadoLicitacion>>({});

  const estadoDe = (p: LicProceso): EstadoLicitacion => optimista[p.id] ?? p.estado;

  const columnas = [
    ...COLUMNAS_FIJAS,
    ...COLUMNAS_SI_HAY.filter((e) => procesos.some((p) => estadoDe(p) === e)),
  ].sort(
    (a, b) =>
      [...COLUMNAS_FIJAS, ...COLUMNAS_SI_HAY].indexOf(a) -
      [...COLUMNAS_FIJAS, ...COLUMNAS_SI_HAY].indexOf(b),
  );

  async function mover(procesoId: string, destino: EstadoLicitacion) {
    const proceso = procesos.find((p) => p.id === procesoId);
    if (!proceso) return;
    const origen = estadoDe(proceso);
    if (origen === destino) return;

    setOptimista((prev) => ({ ...prev, [procesoId]: destino }));
    const error = await actualizarProcesoAction(procesoId, { estado: destino });
    if (error) {
      // Se deshace: la tarjeta vuelve sola a donde estaba.
      setOptimista((prev) => {
        const resto = { ...prev };
        delete resto[procesoId];
        return resto;
      });
      avisoError(error);
      return;
    }
    router.refresh();
  }

  return (
    // El scroll horizontal aquí SÍ es correcto: es el idioma del tablero
    // (Trello, Jira), a diferencia de la tabla, donde era un fallo.
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columnas.map((estado) => {
        const enColumna = procesos.filter((p) => estadoDe(p) === estado);
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
              // Solo cuando el puntero sale de la columna ENTERA, no al pasar
              // de una tarjeta a otra dentro de ella.
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
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${ESTADO_LIC_CHIP[estado].dot}`}
                aria-hidden
              />
              <h3
                className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink"
                title={ESTADO_LIC_DESCRIPCION[estado]}
              >
                {ESTADO_LIC_LABEL[estado]}
              </h3>
              <span className="font-mono text-[11px] text-muted">{enColumna.length}</span>
            </header>

            <div className="flex min-h-24 flex-1 flex-col gap-2 p-2">
              {enColumna.map((p) => {
                const sub = subsanaciones[p.id] ?? null;
                const dias = sub
                  ? diasAlCierre(sub)
                  : VIVO[estadoDe(p)]
                    ? diasAlCierre(p.cierre)
                    : null;
                const nivel = nivelUrgencia(dias);
                const ent = p.institucion_id ? entidades[p.institucion_id] ?? null : null;
                const enDrag = arrastrando === p.id;
                return (
                  <article
                    key={p.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", p.id);
                      e.dataTransfer.effectAllowed = "move";
                      setArrastrando(p.id);
                    }}
                    onDragEnd={() => {
                      setArrastrando(null);
                      setColumnaDestino(null);
                    }}
                    className={`cursor-grab rounded-md border border-line bg-surface p-2.5 shadow-card transition-opacity active:cursor-grabbing ${
                      enDrag ? "opacity-40" : "hover:border-line-strong"
                    }`}
                  >
                    {/* draggable={false} en el enlace: si no, el navegador
                        arrastra la URL en vez de la tarjeta. */}
                    <Link
                      href={`/licitaciones/${p.id}`}
                      prefetch={false}
                      draggable={false}
                      className="block min-w-0"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="min-w-0 truncate font-mono text-[11.5px] font-medium text-ink">
                          {p.codigo}
                        </span>
                        <span
                          className="max-w-[72px] shrink-0 truncate rounded bg-surface-2 px-1 py-px font-mono text-[9.5px] font-medium uppercase text-muted"
                          title={MODALIDAD_LABEL[p.modalidad] ?? p.modalidad}
                        >
                          {p.modalidad}
                        </span>
                      </span>

                      {/* El objeto a tres líneas: en una tarjeta hay sitio
                          para leerlo, que es lo que la tabla no puede dar. */}
                      <span className="mt-1 line-clamp-3 block text-[12px] leading-snug text-ink-soft">
                        {p.objeto ?? "Sin objeto"}
                      </span>

                      <span className="mt-2 flex flex-wrap items-center gap-1.5">
                        {(sub || VIVO[estadoDe(p)]) && (
                          <span
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10.5px] font-medium ${urgenciaChip(nivel)}`}
                            title={sub ? "Fecha límite de la subsanación abierta" : "Cierre del proceso"}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${urgenciaDot(nivel)}`}
                              aria-hidden
                            />
                            {textoDias(dias)}
                          </span>
                        )}
                        {sub && (
                          <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[9.5px] font-semibold uppercase text-warn">
                            Subsana
                          </span>
                        )}
                        {ent && (
                          <span
                            className="ml-auto min-w-0 truncate text-[11px] text-muted"
                            title={ent.nombre}
                          >
                            {ent.siglas ?? ent.nombre}
                          </span>
                        )}
                      </span>
                    </Link>
                  </article>
                );
              })}

              {enColumna.length === 0 && (
                <p className="rounded-md border border-dashed border-line px-2 py-4 text-center text-[11.5px] text-muted">
                  {esDestino ? "Soltar aquí" : "Vacía"}
                </p>
              )}
            </div>

            {estado === "captura" && (
              <Link
                href="/licitaciones/nuevo"
                className="flex items-center gap-1.5 border-t border-line px-3 py-2 text-[12px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
                Nuevo proceso
              </Link>
            )}
          </section>
        );
      })}
    </div>
  );
}
