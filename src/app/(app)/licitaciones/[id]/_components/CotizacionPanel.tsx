"use client";

// PASO 2 — La cotización: con el panorama del pliego completo, se arma la
// parte económica SOLO sobre los ítems que decidimos ofertar. Qué producto
// ofrecemos (marca/modelo/descripción) y a qué precio — del catálogo de
// Precios (snapshot congelado) o manual.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Search } from "lucide-react";
import { Panel, SectionTitle } from "@/components/ui";
import { formatRD } from "@/lib/types";
import { fmtUSD } from "@/lib/precios/tipos";
import { buscarPreciosAction } from "@/lib/actions/precios";
import {
  actualizarItemAction,
  cotizarItemAction,
} from "@/lib/actions/licitaciones";
import type { LicItem } from "@/lib/licitaciones/tipos";
import {
  totalesItem,
  totalesProceso,
  type ParamsCotizacion,
} from "@/lib/licitaciones/cotizador";

const inputSm =
  "rounded-md border border-line bg-surface px-2 py-1 text-[12.5px] text-ink outline-none focus:border-primary";

export default function CotizacionPanel({
  items,
  params,
}: {
  items: LicItem[];
  params: ParamsCotizacion;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const ofertados = items.filter((i) => i.ofertamos);
  const sinPrecio = ofertados.filter((i) => i.precio_unitario === null).length;
  const totales = totalesProceso(items, params.itbisPct);

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
        icon={Calculator}
        right={
          <span className="font-mono text-[12px] text-muted">
            {sinPrecio > 0
              ? `${sinPrecio} sin cotizar`
              : ofertados.length > 0
                ? "todo cotizado"
                : ""}
          </span>
        }
      >
        Cotización ({ofertados.length} ítem{ofertados.length === 1 ? "" : "s"} a ofertar)
      </SectionTitle>

      {error && (
        <p className="mx-4 mt-3 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      )}

      {params.tasa === null && (
        <p className="mx-4 mt-3 rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
          Configura la tasa USD→DOP en Configuración → Empresa para cotizar
          desde el catálogo.
        </p>
      )}

      <ul className="divide-y divide-line">
        {ofertados.map((item) => (
          <ItemCotizacion
            key={item.id}
            item={item}
            params={params}
            onPatch={(patch) => correr(() => actualizarItemAction(item.id, patch))}
            onCotizar={(o) => correr(() => cotizarItemAction(item.id, o))}
          />
        ))}
        {ofertados.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted">
            No hay ítems marcados para ofertar. Primero completa el paso 1
            (Pliego): decide qué ítems ofertamos.
          </li>
        )}
      </ul>

      {totales.total > 0 && (
        <p className="border-t border-line px-4 py-2.5 text-right font-mono text-[13px] text-ink">
          Subtotal {formatRD(totales.subtotal)} · ITBIS {formatRD(totales.itbis)} ·{" "}
          <strong>Total {formatRD(totales.total)}</strong>
        </p>
      )}
    </Panel>
  );
}

function ItemCotizacion({
  item,
  params,
  onPatch,
  onCotizar,
}: {
  item: LicItem;
  params: ParamsCotizacion;
  onPatch: (patch: Parameters<typeof actualizarItemAction>[1]) => void;
  onCotizar: (o: { suplidor_id: string; sku: string; costo_usd: number }) => void;
}) {
  const [buscando, setBuscando] = useState(false);
  const t = totalesItem(item, params.itbisPct);

  return (
    <li className="space-y-2 px-4 py-3">
      {/* Lo que pidieron (solo lectura — se edita en el paso 1) */}
      <p className="text-[12px] text-muted">
        <span className="font-mono font-semibold">#{item.numero}</span>{" "}
        {item.spec_cruda || "(sin especificación)"} ·{" "}
        <span className="font-mono">{item.cantidad} {item.unidad}</span>
      </p>

      {/* Lo que ofrecemos */}
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

      {/* El precio */}
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
    </li>
  );
}

// Buscador compacto sobre el catálogo de Precios. Elegir congela
// costo→tasa→margen→precio en el ítem (snapshot).
function SelectorProducto({
  onElegir,
}: {
  onElegir: (p: { suplidor_id: string; sku: string; costo_usd: number }) => void;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<
    {
      id: number;
      sku: string;
      descripcion: string | null;
      precio: number | null;
      suplidor_id: string;
      suplidor_nombre: string;
    }[]
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
