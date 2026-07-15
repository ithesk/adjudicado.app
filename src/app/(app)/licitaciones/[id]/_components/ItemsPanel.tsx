"use client";

// Ítems del expediente: la spec cruda del pliego (intocable), lo que se
// decide ofertar, y la cotización — desde el catálogo de Precios (snapshot
// congelado) o precio manual.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Plus, Search, Trash2 } from "lucide-react";
import { Panel, SectionTitle, btnPrimary } from "@/components/ui";
import { formatRD } from "@/lib/types";
import { fmtUSD } from "@/lib/precios/tipos";
import { buscarPreciosAction } from "@/lib/actions/precios";
import {
  actualizarItemAction,
  cotizarItemAction,
  crearItemAction,
  eliminarItemAction,
} from "@/lib/actions/licitaciones";
import type { LicItem, LicProceso } from "@/lib/licitaciones/tipos";
import { totalesItem, type ParamsCotizacion } from "@/lib/licitaciones/cotizador";

const inputSm =
  "rounded-md border border-line bg-surface px-2 py-1 text-[12.5px] text-ink outline-none focus:border-primary";

export default function ItemsPanel({
  proceso,
  items,
  params,
}: {
  proceso: LicProceso;
  items: LicItem[];
  params: ParamsCotizacion;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function correr(fn: () => Promise<string | null>) {
    setError(null);
    startTransition(async () => {
      const err = await fn();
      if (err) setError(err);
      router.refresh();
    });
  }

  return (
    <Panel>
      <SectionTitle
        icon={ListChecks}
        right={
          <button
            type="button"
            disabled={pendiente}
            onClick={() => correr(() => crearItemAction(proceso.id))}
            className={btnPrimary("!px-2.5 !py-1 !text-[12.5px]")}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
            Ítem
          </button>
        }
      >
        Ítems ({items.length})
      </SectionTitle>

      {error && (
        <p className="mx-4 mt-3 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      )}

      <ul className="divide-y divide-line">
        {items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            params={params}
            pendiente={pendiente}
            onPatch={(patch) => correr(() => actualizarItemAction(item.id, patch))}
            onCotizar={(origen) => correr(() => cotizarItemAction(item.id, origen))}
            onEliminar={() => {
              if (confirm(`¿Eliminar el ítem ${item.numero}?`))
                correr(() => eliminarItemAction(item.id));
            }}
          />
        ))}
        {items.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted">
            Agrega los ítems del pliego. La descripción se pega TAL CUAL — es la
            evidencia de lo que pidió la entidad.
          </li>
        )}
      </ul>
    </Panel>
  );
}

function ItemCard({
  item,
  params,
  pendiente,
  onPatch,
  onCotizar,
  onEliminar,
}: {
  item: LicItem;
  params: ParamsCotizacion;
  pendiente: boolean;
  onPatch: (patch: Parameters<typeof actualizarItemAction>[1]) => void;
  onCotizar: (o: { suplidor_id: string; sku: string; costo_usd: number }) => void;
  onEliminar: () => void;
}) {
  const [buscando, setBuscando] = useState(false);
  const t = totalesItem(item, params.itbisPct);

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-start gap-2">
        <span className="mt-1 font-mono text-xs font-semibold text-muted">
          #{item.numero}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          {/* La spec del pliego: textarea sin adornos, se pega tal cual. */}
          <textarea
            defaultValue={item.spec_cruda}
            placeholder="Especificación TAL CUAL aparece en el pliego…"
            rows={2}
            onBlur={(e) => {
              if (e.target.value !== item.spec_cruda)
                onPatch({ spec_cruda: e.target.value });
            }}
            className="w-full resize-y rounded-md border border-line bg-surface px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-primary"
          />

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              defaultValue={item.cantidad}
              min={0.01}
              step="0.01"
              title="Cantidad"
              onBlur={(e) => {
                const v = Number(e.target.value) || 1;
                if (v !== item.cantidad) onPatch({ cantidad: v });
              }}
              className={`${inputSm} w-20 text-right`}
            />
            <input
              defaultValue={item.unidad}
              title="Unidad"
              onBlur={(e) => {
                if (e.target.value !== item.unidad)
                  onPatch({ unidad: e.target.value || "UD" });
              }}
              className={`${inputSm} w-16`}
            />
            <label className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
              <input
                type="checkbox"
                checked={item.ofertamos}
                onChange={(e) => onPatch({ ofertamos: e.target.checked })}
              />
              Ofertamos
            </label>
            {!item.ofertamos && (
              <input
                defaultValue={item.motivo_descarte ?? ""}
                placeholder="Motivo del descarte (obligatorio)"
                onBlur={(e) => onPatch({ motivo_descarte: e.target.value || null })}
                className={`${inputSm} min-w-52 flex-1`}
              />
            )}
            <button
              type="button"
              onClick={onEliminar}
              disabled={pendiente}
              className="ml-auto rounded p-1 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
              aria-label="Eliminar ítem"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>

          {item.ofertamos && (
            <>
              {/* Lo que ofertamos (separado de la spec) */}
              <div className="flex flex-wrap gap-2">
                <input
                  defaultValue={item.marca ?? ""}
                  placeholder="Marca"
                  onBlur={(e) => onPatch({ marca: e.target.value || null })}
                  className={`${inputSm} w-28`}
                />
                <input
                  defaultValue={item.modelo ?? ""}
                  placeholder="Modelo"
                  onBlur={(e) => onPatch({ modelo: e.target.value || null })}
                  className={`${inputSm} w-32`}
                />
                <input
                  defaultValue={item.descripcion ?? ""}
                  placeholder="Descripción afirmativa de lo ofertado"
                  onBlur={(e) => onPatch({ descripcion: e.target.value || null })}
                  className={`${inputSm} min-w-56 flex-1`}
                />
              </div>

              {/* Cotización */}
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-surface-2 px-2 py-1.5">
                {item.sku ? (
                  <span className="font-mono text-[11.5px] text-muted">
                    {item.sku} · costo {fmtUSD(item.costo_usd)} × {item.tasa} ×{" "}
                    {item.margen_modo === "margen" ? "÷" : "+"}
                    {item.margen_pct}%
                  </span>
                ) : (
                  <span className="text-[11.5px] text-muted">
                    {item.precio_unitario !== null ? "Precio manual" : "Sin cotizar"}
                  </span>
                )}

                <input
                  type="number"
                  key={`precio-${item.precio_unitario}`}
                  defaultValue={item.precio_unitario ?? ""}
                  min={0}
                  step="0.01"
                  placeholder="Unitario RD$"
                  title="Precio unitario de venta, sin ITBIS (teclearlo lo vuelve manual)"
                  onBlur={(e) => {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    if (v !== item.precio_unitario) onPatch({ precio_unitario: v });
                  }}
                  className={`${inputSm} w-32 text-right font-mono`}
                />
                <label className="flex items-center gap-1 text-[11.5px] text-ink-soft">
                  <input
                    type="checkbox"
                    checked={item.itbis_aplica}
                    onChange={(e) => onPatch({ itbis_aplica: e.target.checked })}
                  />
                  ITBIS
                </label>

                {t && (
                  <span className="font-mono text-[12px] text-ink">
                    = {formatRD(t.subtotal)}
                    {t.itbis > 0 ? ` + ${formatRD(t.itbis)}` : ""} →{" "}
                    <strong>{formatRD(t.total)}</strong>
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => setBuscando((v) => !v)}
                  className="ml-auto flex items-center gap-1 text-[12px] font-medium text-primary transition-colors hover:underline"
                >
                  <Search className="h-3 w-3" strokeWidth={2} aria-hidden />
                  {item.sku ? "Recotizar" : "Cotizar del catálogo"}
                </button>
              </div>

              {buscando && (
                <SelectorProducto
                  onElegir={(p) => {
                    setBuscando(false);
                    onCotizar(p);
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

// Buscador compacto sobre el catálogo de Precios (buscarPreciosAction ya
// existe). Elegir un producto congela costo→precio en el ítem.
function SelectorProducto({
  onElegir,
}: {
  onElegir: (p: { suplidor_id: string; sku: string; costo_usd: number }) => void;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<
    { id: number; sku: string; descripcion: string | null; precio: number | null; suplidor_id: string; suplidor_nombre: string }[]
  >([]);
  const [, startTransition] = useTransition();

  function buscar(texto: string) {
    setQ(texto);
    if (texto.trim().length < 2) {
      setResultados([]);
      return;
    }
    startTransition(async () => {
      const d = await buscarPreciosAction(texto, {});
      setResultados(d.productos.slice(0, 8));
    });
  }

  return (
    <div className="rounded-md border border-line bg-surface p-2">
      <input
        autoFocus
        value={q}
        onChange={(e) => buscar(e.target.value)}
        placeholder="Buscar en el catálogo de precios (SKU o descripción)…"
        className={`${inputSm} w-full`}
      />
      <ul className="mt-1 max-h-48 divide-y divide-line overflow-y-auto">
        {resultados.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              disabled={p.precio === null}
              onClick={() =>
                p.precio !== null &&
                onElegir({ suplidor_id: p.suplidor_id, sku: p.sku, costo_usd: p.precio })
              }
              className="flex w-full items-center gap-2 px-1 py-1.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-50"
            >
              <span className="font-mono text-[11.5px] font-medium text-ink">{p.sku}</span>
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">
                {p.descripcion}
              </span>
              <span className="font-mono text-[11.5px] text-ink">{fmtUSD(p.precio)}</span>
            </button>
          </li>
        ))}
        {q.trim().length >= 2 && resultados.length === 0 && (
          <li className="px-1 py-2 text-[11.5px] text-muted">Sin resultados.</li>
        )}
      </ul>
    </div>
  );
}
