"use client";

// Administración de listas de precios: qué lista está vigente por suplidor,
// qué tan fresca es (semáforo), historial completo, rollback a una lista
// anterior, eliminación e importación.

import { useState, useTransition } from "react";
import { CheckCircle2, FileSpreadsheet, History, RotateCcw, Trash2, Truck } from "lucide-react";
import { Panel, SectionTitle } from "@/components/ui";
import { activarListaAction, eliminarListaAction } from "@/lib/actions/precios";
import { edadLista, type ListaPrecio, type ResumenPrecios } from "@/lib/precios/tipos";
import ImportarLista from "../ImportarLista";
import type { SuplidorOpcion } from "../BuscadorPrecios";

const NIVEL_DOT = {
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
} as const;

const NIVEL_TEXTO = {
  ok: "al día",
  warn: "por renovar",
  danger: "desactualizada",
} as const;

export default function ListasManager({
  listas,
  resumen,
  suplidores,
}: {
  listas: ListaPrecio[];
  resumen: ResumenPrecios;
  suplidores: SuplidorOpcion[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [ocupadaId, setOcupadaId] = useState<string | null>(null);

  const activar = (l: ListaPrecio) => {
    setOcupadaId(l.id);
    setError(null);
    startTransition(async () => {
      const e = await activarListaAction(l.id);
      if (e) setError("No se pudo activar la lista: " + e);
      setOcupadaId(null);
    });
  };

  const eliminar = (l: ListaPrecio) => {
    const aviso = l.is_active
      ? `"${l.filename ?? "esta lista"}" es la lista VIGENTE de ${l.suplidor_nombre}. Al eliminarla, sus ${l.row_count.toLocaleString()} productos desaparecen del buscador hasta importar otra. ¿Eliminar?`
      : `Eliminar "${l.filename ?? "esta lista"}" (${l.row_count.toLocaleString()} productos del historial de ${l.suplidor_nombre})? Las notas y resaltados del equipo no se pierden.`;
    if (!window.confirm(aviso)) return;
    setOcupadaId(l.id);
    setError(null);
    startTransition(async () => {
      const e = await eliminarListaAction(l.id);
      if (e) setError("No se pudo eliminar la lista: " + e);
      setOcupadaId(null);
    });
  };

  // Agrupadas por suplidor, vigente primero (vienen ordenadas por fecha).
  const grupos = new Map<string, ListaPrecio[]>();
  for (const l of listas) {
    const g = grupos.get(l.suplidor_id) ?? [];
    g.push(l);
    grupos.set(l.suplidor_id, g);
  }

  return (
    <div className="flex flex-col gap-4">
      <ImportarLista suplidores={suplidores} listas={resumen.listas} />

      {error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
      )}

      {listas.length === 0 && (
        <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          Aún no hay listas importadas. Sube el Excel de un suplidor para empezar.
        </p>
      )}

      {[...grupos.entries()].map(([suplidorId, grupo]) => {
        const vigente = grupo.find((l) => l.is_active);
        const frescura = vigente ? edadLista(vigente.vigencia, vigente.importada_at) : null;
        return (
          <Panel key={suplidorId}>
            <SectionTitle
              icon={Truck}
              right={
                frescura ? (
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <span className={`h-2 w-2 rounded-full ${NIVEL_DOT[frescura.nivel]}`} />
                    {NIVEL_TEXTO[frescura.nivel]} · vigencia {frescura.label}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <span className="h-2 w-2 rounded-full bg-danger" />
                    sin lista vigente
                  </span>
                )
              }
            >
              {grupo[0].suplidor_nombre}
              <span className="font-normal text-muted">
                · {grupo.length} lista{grupo.length === 1 ? "" : "s"}
              </span>
            </SectionTitle>

            <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm md:min-w-[640px]">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  <th className="px-4 py-2 font-medium">Archivo</th>
                  <th className="hidden w-[104px] px-3 py-2 font-medium md:table-cell">Vigencia</th>
                  <th className="hidden w-[130px] px-3 py-2 font-medium md:table-cell">Importada</th>
                  <th className="hidden w-[92px] px-3 py-2 text-right font-medium md:table-cell">Productos</th>
                  <th className="w-[96px] px-3 py-2 font-medium">Estado</th>
                  <th className="w-[110px] px-3 py-2 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {grupo.map((l) => {
                  const ocupada = pendiente && ocupadaId === l.id;
                  return (
                    <tr key={l.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-2">
                          <FileSpreadsheet
                            className="h-3.5 w-3.5 shrink-0 text-muted"
                            strokeWidth={2}
                            aria-hidden
                          />
                          <span className="truncate text-ink" title={l.filename ?? ""}>
                            {l.filename ?? "—"}
                          </span>
                        </span>
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-2 text-xs text-ink-soft md:table-cell">
                        {l.vigencia ?? "—"}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-2 text-xs text-ink-soft md:table-cell">
                        {l.importada_at.slice(0, 10)}
                        <span className="text-muted">
                          {" "}
                          · {edadLista(null, l.importada_at).label}
                        </span>
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-2 text-right font-mono text-xs text-ink md:table-cell">
                        {l.row_count.toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        {l.is_active ? (
                          <span className="inline-flex items-center gap-1 rounded bg-ok-soft px-1.5 py-0.5 text-[11px] font-medium text-ok">
                            <CheckCircle2 className="h-3 w-3" strokeWidth={2.4} aria-hidden />
                            vigente
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
                            <History className="h-3 w-3" strokeWidth={2} aria-hidden />
                            historial
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center justify-end gap-1">
                          {!l.is_active && (
                            <button
                              type="button"
                              onClick={() => activar(l)}
                              disabled={ocupada}
                              title="Volver a esta lista (queda vigente)"
                              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                            >
                              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                              Activar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => eliminar(l)}
                            disabled={ocupada}
                            title="Eliminar lista y sus productos"
                            aria-label={`Eliminar ${l.filename ?? "lista"}`}
                            className="rounded-md p-1 text-muted transition-colors hover:bg-surface-2 hover:text-danger disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </Panel>
        );
      })}

      {listas.length > 0 && (
        <p className="text-xs text-muted">
          La lista <span className="text-ok">vigente</span> es la que responde en el buscador;
          las de <span className="text-ink-soft">historial</span> alimentan la columna de
          precios anteriores en el detalle de cada producto. «Activar» vuelve a una lista
          anterior sin re-importar. Semáforo de frescura: verde ≤ 100 días, ámbar ≤ 200,
          rojo más vieja.
        </p>
      )}
    </div>
  );
}
