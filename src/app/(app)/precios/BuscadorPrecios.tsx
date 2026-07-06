"use client";

// Buscador de precios de suplidores (portado de ListApp): búsqueda
// instantánea con facetas calculadas sobre todas las coincidencias,
// tabla de resultados y peek lateral con detalle + anotaciones.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  MessageSquare,
  Search,
  Upload,
  X,
} from "lucide-react";
import { buscarPreciosAction, detallePrecioAction } from "@/lib/actions/precios";
import {
  fmtUSD,
  fmtTermino,
  labelTermino,
  marcaBg,
  marcaDot,
  type DetallePrecio,
  type FacetasPrecios,
  type OrdenPrecios,
  type ProductoPrecio,
  type ResumenPrecios,
} from "@/lib/precios/tipos";
import { btnGhost } from "@/components/ui";
import ImportarLista from "./ImportarLista";
import ProductoPeek from "./ProductoPeek";

export interface SuplidorOpcion {
  id: string;
  nombre: string;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active
          ? "border-primary/40 bg-primary/10 font-medium text-primary"
          : "border-line text-muted hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

export default function BuscadorPrecios({
  resumen,
  suplidores,
}: {
  resumen: ResumenPrecios;
  suplidores: SuplidorOpcion[];
}) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<ProductoPrecio[]>([]);
  const [facetas, setFacetas] = useState<FacetasPrecios | null>(null);
  const [cargando, setCargando] = useState(false);
  const [filtroSuplidor, setFiltroSuplidor] = useState("");
  const [filtroFamilia, setFiltroFamilia] = useState("");
  const [filtroTerm, setFiltroTerm] = useState("");
  const [orden, setOrden] = useState<OrdenPrecios>("relevance");
  const [seleccionado, setSeleccionado] = useState<ProductoPrecio | null>(null);
  const [detalle, setDetalle] = useState<DetallePrecio | null>(null);
  const [importando, setImportando] = useState(false);
  const seqRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const buscar = useCallback(
    (q: string, suplidor: string, familia: string, term: string, ordenar: OrdenPrecios) => {
      const seq = ++seqRef.current;
      if (q.trim().length < 2) {
        setResultados([]);
        setFacetas(null);
        setCargando(false);
        return;
      }
      setCargando(true);
      buscarPreciosAction(q, {
        suplidor: suplidor || undefined,
        familia: familia || undefined,
        term: term || undefined,
        orden: ordenar,
      })
        .then((d) => {
          if (seq !== seqRef.current) return; // llegó una búsqueda más nueva
          setResultados(d.productos);
          setFacetas(d.facetas);
          setCargando(false);
        })
        .catch(() => {
          if (seq === seqRef.current) setCargando(false);
        });
    },
    [],
  );

  useEffect(() => {
    const t = setTimeout(
      () => buscar(query, filtroSuplidor, filtroFamilia, filtroTerm, orden),
      180,
    );
    return () => clearTimeout(t);
  }, [query, filtroSuplidor, filtroFamilia, filtroTerm, orden, buscar]);

  const abrirDetalle = (p: ProductoPrecio) => {
    setSeleccionado(p);
    setDetalle(null);
    detallePrecioAction(p.suplidor_id, p.sku)
      .then(setDetalle)
      .catch(() => {});
  };

  // Refresca resultados sin resetear la UI (tras marcar/comentar en el peek).
  const refrescar = useCallback(() => {
    buscar(query, filtroSuplidor, filtroFamilia, filtroTerm, orden);
  }, [query, filtroSuplidor, filtroFamilia, filtroTerm, orden, buscar]);

  const hayFiltros = Boolean(filtroSuplidor || filtroFamilia || filtroTerm || orden !== "relevance");
  const limpiarFiltros = () => {
    setFiltroSuplidor("");
    setFiltroFamilia("");
    setFiltroTerm("");
    setOrden("relevance");
  };

  const buscando = query.trim().length >= 2;
  const variosSuplidores = resumen.suplidores > 1;

  return (
    <div className="flex flex-col gap-4">
      {/* Búsqueda + acción de importar */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              strokeWidth={2}
              aria-hidden
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por SKU o descripción… ej: FG-100F, FortiGate 3 años, switch 24 puertos"
              className="w-full rounded-lg border border-line bg-surface py-2.5 pl-9 pr-9 text-sm text-ink shadow-card outline-none transition-colors placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-[var(--ring)]"
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Limpiar búsqueda"
                className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setImportando((v) => !v)}
            className={btnGhost("shrink-0")}
          >
            <Upload className="h-4 w-4" strokeWidth={2} aria-hidden />
            Importar lista
          </button>
        </div>

        {importando && (
          <ImportarLista
            suplidores={suplidores}
            listas={resumen.listas}
            onCerrar={() => setImportando(false)}
          />
        )}

        {/* Filtros dinámicos: sobre TODAS las coincidencias de la búsqueda actual */}
        {buscando && facetas && (
          <div className="flex flex-col gap-2">
            {facetas.terms.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                <span className="shrink-0 text-xs text-muted">Término:</span>
                <Chip active={filtroTerm === ""} onClick={() => setFiltroTerm("")}>
                  Todos
                </Chip>
                {facetas.terms.map((t) => (
                  <Chip
                    key={t.value}
                    active={filtroTerm === t.value}
                    onClick={() => setFiltroTerm(filtroTerm === t.value ? "" : t.value)}
                  >
                    {labelTermino(t.value)}
                    <span className={filtroTerm === t.value ? "text-primary/70" : "text-muted"}>
                      {t.count.toLocaleString()}
                    </span>
                  </Chip>
                ))}
              </div>
            )}

            {facetas.familias.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                <span className="shrink-0 text-xs text-muted">Familia:</span>
                <Chip active={filtroFamilia === ""} onClick={() => setFiltroFamilia("")}>
                  Todas
                </Chip>
                {facetas.familias.map((f) => (
                  <Chip
                    key={f.value}
                    active={filtroFamilia === f.value}
                    onClick={() => setFiltroFamilia(filtroFamilia === f.value ? "" : f.value)}
                  >
                    <span className="max-w-40 truncate">{f.value}</span>
                    <span className={filtroFamilia === f.value ? "text-primary/70" : "text-muted"}>
                      {f.count.toLocaleString()}
                    </span>
                  </Chip>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              {facetas.suplidores.length > 1 && (
                <>
                  <span className="text-xs text-muted">Suplidor:</span>
                  {facetas.suplidores.map((s) => (
                    <Chip
                      key={s.id}
                      active={filtroSuplidor === s.id}
                      onClick={() => setFiltroSuplidor(filtroSuplidor === s.id ? "" : s.id)}
                    >
                      {s.nombre}
                      <span className={filtroSuplidor === s.id ? "text-primary/70" : "text-muted"}>
                        {s.count.toLocaleString()}
                      </span>
                    </Chip>
                  ))}
                  <span className="mx-1 h-4 w-px bg-line" />
                </>
              )}
              <Chip
                active={orden === "price_asc"}
                onClick={() => setOrden(orden === "price_asc" ? "relevance" : "price_asc")}
              >
                <ArrowUpNarrowWide className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Precio menor
              </Chip>
              <Chip
                active={orden === "price_desc"}
                onClick={() => setOrden(orden === "price_desc" ? "relevance" : "price_desc")}
              >
                <ArrowDownNarrowWide className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Precio mayor
              </Chip>
              {hayFiltros && (
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="rounded-full px-2.5 py-1 text-xs text-muted transition-colors hover:bg-surface-2"
                >
                  Limpiar filtros
                </button>
              )}
              <span className="ml-auto text-xs text-muted">
                {facetas.total.toLocaleString()} resultado{facetas.total === 1 ? "" : "s"}
                {facetas.total > resultados.length ? ` · mostrando ${resultados.length}` : ""}
                {facetas.min_precio !== null && facetas.max_precio !== null && facetas.total > 1
                  ? ` · ${fmtUSD(facetas.min_precio)} – ${fmtUSD(facetas.max_precio)}`
                  : ""}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Estado inicial */}
      {!buscando &&
        (resumen.productos > 0 ? (
          <p className="text-sm text-muted">
            {resumen.productos.toLocaleString()} productos de {resumen.suplidores}{" "}
            suplidor{resumen.suplidores === 1 ? "" : "es"} listos para buscar. Escribe
            al menos 2 caracteres — la búsqueda encuentra coincidencias parciales de
            SKU y descripción.
          </p>
        ) : (
          <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            Aún no hay listas de precios. Usa «Importar lista» para subir el Excel de
            un suplidor y empezar a buscar.
          </p>
        ))}

      {buscando && !cargando && resultados.length === 0 && (
        <p className="py-10 text-center text-sm text-muted">
          Sin resultados para &ldquo;{query}&rdquo;
          {hayFiltros ? " con los filtros aplicados." : "."}
        </p>
      )}

      {/* Resultados */}
      {resultados.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                <th className="w-[200px] px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Descripción</th>
                <th className="w-[84px] px-3 py-2 font-medium">Término</th>
                <th className="w-[118px] px-3 py-2 text-right font-medium">Precio</th>
                {variosSuplidores && (
                  <th className="w-[110px] px-3 py-2 font-medium">Suplidor</th>
                )}
              </tr>
            </thead>
            <tbody>
              {resultados.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => abrirDetalle(p)}
                  className={`cursor-pointer border-b border-line transition-colors last:border-0 ${
                    p.marca_color ? "" : "hover:bg-surface-2"
                  }`}
                  style={{ background: marcaBg(p.marca_color) }}
                >
                  <td className="px-3 py-2 font-mono text-xs font-medium text-ink">
                    <span className="flex items-center gap-1.5">
                      {p.marca_color && (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: marcaDot(p.marca_color) }}
                        />
                      )}
                      <span className="truncate" title={p.sku}>
                        {p.sku}
                      </span>
                      {p.comentarios > 0 && (
                        <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted">
                          <MessageSquare className="h-[11px] w-[11px]" strokeWidth={2} />
                          {p.comentarios}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="truncate text-ink" title={p.descripcion ?? ""}>
                      {p.descripcion}
                    </div>
                    {p.descripcion2 && (
                      <div className="truncate text-xs text-muted" title={p.descripcion2}>
                        {p.descripcion2}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-soft">
                    {fmtTermino(p.term_meses)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-ink">
                    {fmtUSD(p.precio)}
                  </td>
                  {variosSuplidores && (
                    <td className="truncate px-3 py-2 text-xs text-ink-soft">
                      {p.suplidor_nombre}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {facetas && facetas.total > resultados.length && (
            <p className="border-t border-line px-3 py-2 text-xs text-muted">
              Mostrando {resultados.length} de {facetas.total.toLocaleString()} resultados —
              usa los filtros o refina la búsqueda para ver el resto.
            </p>
          )}
        </div>
      )}

      {seleccionado && (
        <ProductoPeek
          producto={seleccionado}
          detalle={detalle}
          onClose={() => {
            setSeleccionado(null);
            setDetalle(null);
          }}
          onAnotado={refrescar}
        />
      )}
    </div>
  );
}
