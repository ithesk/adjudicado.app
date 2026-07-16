"use client";

// Los ítems como COTIZADOR estilo Odoo: una tabla de líneas — descripción
// (la spec del pliego, tal cual), lo que ofertamos, cantidad, precio
// unitario, ITBIS y subtotal — con los totales abajo a la derecha. Cada
// celda edita en línea y guarda al salir. El precio sale del catálogo de
// Precios (snapshot congelado) o se teclea (manual).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Plus, Search, Trash2, X } from "lucide-react";
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
import {
  totalesItem,
  totalesProceso,
  type ParamsCotizacion,
} from "@/lib/licitaciones/cotizador";

const celda =
  "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-[12.5px] text-ink outline-none transition-colors hover:border-line focus:border-primary focus:bg-surface";

export default function CotizadorItems({
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
  const [buscandoEn, setBuscandoEn] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const totales = totalesProceso(items, params.itbisPct);
  const sinCotizar = items.filter(
    (i) => i.ofertamos && i.precio_unitario === null,
  ).length;

  function correr(fn: () => Promise<string | null>) {
    setError(null);
    startTransition(async () => {
      const err = await fn();
      if (err) setError(err);
      router.refresh();
    });
  }

  const patch = (id: string, p: Parameters<typeof actualizarItemAction>[1]) =>
    correr(() => actualizarItemAction(id, p));

  return (
    <Panel>
      <SectionTitle
        icon={Calculator}
        right={
          <span className="flex items-center gap-2">
            {sinCotizar > 0 && (
              <span className="font-mono text-[11.5px] text-warn">
                {sinCotizar} sin cotizar
              </span>
            )}
            <button
              type="button"
              disabled={pendiente}
              onClick={() => correr(() => crearItemAction(proceso.id))}
              className={btnPrimary("!px-2.5 !py-1 !text-[12.5px]")}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
              Línea
            </button>
          </span>
        }
      >
        Ítems ({items.length})
      </SectionTitle>

      {error && (
        <p className="mx-4 mt-3 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      )}
      {params.tasa === null && (
        <p className="mx-4 mt-3 rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
          Configura la tasa USD→DOP en Configuración → Empresa para cotizar del
          catálogo (el precio manual funciona igual).
        </p>
      )}

      <div className="overflow-x-auto">
        {/* table-fixed + colgroup: la descripción se queda con TODO el espacio
            sobrante (sin esto, las filas combinadas de abajo inflan las
            columnas chicas y la unidad termina más ancha que la descripción). */}
        <table className="w-full min-w-[760px] table-fixed text-sm">
          <colgroup>
            <col className="w-8" />
            <col />
            <col className="w-16" />
            <col className="w-14" />
            <col className="w-28" />
            <col className="w-11" />
            <col className="w-28" />
            <col className="w-9" />
          </colgroup>
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
              <th className="px-2 py-1.5 font-medium">#</th>
              <th className="px-2 py-1.5 font-medium">Descripción del pliego</th>
              <th className="px-2 py-1.5 text-right font-medium">Cant</th>
              <th className="px-2 py-1.5 font-medium">UD</th>
              <th className="px-2 py-1.5 text-right font-medium">Precio unit.</th>
              <th className="px-2 py-1.5 text-center font-medium">ITBIS</th>
              <th className="px-2 py-1.5 text-right font-medium">Subtotal</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <Linea
                key={item.id}
                item={item}
                params={params}
                pendiente={pendiente}
                buscando={buscandoEn === item.id}
                setBuscando={(v) => setBuscandoEn(v ? item.id : null)}
                onPatch={(p) => patch(item.id, p)}
                onCotizar={(o) => {
                  setBuscandoEn(null);
                  correr(() => cotizarItemAction(item.id, o));
                }}
                onEliminar={() => {
                  if (confirm(`¿Eliminar la línea ${item.numero}?`))
                    correr(() => eliminarItemAction(item.id));
                }}
              />
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted">
                  Agrega las líneas del pliego con «Línea». La descripción se
                  pega TAL CUAL aparece en el pliego.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Totales, estilo cotización */}
      {items.length > 0 && (
        <div className="flex justify-end border-t border-line px-4 py-3">
          <table className="text-right font-mono text-[13px]">
            <tbody>
              <tr>
                <td className="pr-6 text-muted">Subtotal</td>
                <td className="text-ink">{formatRD(totales.subtotal)}</td>
              </tr>
              <tr>
                <td className="pr-6 text-muted">ITBIS ({params.itbisPct}%)</td>
                <td className="text-ink">{formatRD(totales.itbis)}</td>
              </tr>
              <tr className="text-[14px] font-semibold">
                <td className="pr-6 pt-1 text-ink">Total</td>
                <td className="pt-1 text-ink">{formatRD(totales.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function Linea({
  item,
  params,
  pendiente,
  buscando,
  setBuscando,
  onPatch,
  onCotizar,
  onEliminar,
}: {
  item: LicItem;
  params: ParamsCotizacion;
  pendiente: boolean;
  buscando: boolean;
  setBuscando: (v: boolean) => void;
  onPatch: (p: Parameters<typeof actualizarItemAction>[1]) => void;
  onCotizar: (o: { suplidor_id: string; sku: string; costo_usd: number }) => void;
  onEliminar: () => void;
}) {
  const t = totalesItem(item, params.itbisPct);
  const descartado = !item.ofertamos;

  return (
    <>
      <tr className={`border-b border-line ${descartado ? "opacity-50" : ""}`}>
        <td className="px-2 py-1 align-top font-mono text-xs font-semibold text-muted">
          {item.numero}
        </td>
        <td className="px-1 py-1 align-top">
          {/* Crece sola con el contenido (auto-resize al montar y al teclear). */}
          <textarea
            defaultValue={item.spec_cruda}
            placeholder="Descripción tal cual el pliego…"
            rows={1}
            ref={(el) => {
              if (el) {
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }}
            onBlur={(e) => {
              if (e.target.value !== item.spec_cruda)
                onPatch({ spec_cruda: e.target.value });
            }}
            className={`${celda} resize-none overflow-hidden leading-snug`}
          />
        </td>
        <td className="px-1 py-1 text-right align-top">
          <input
            type="number"
            defaultValue={item.cantidad}
            min={0.01}
            step="0.01"
            onBlur={(e) => {
              const v = Number(e.target.value) || 1;
              if (v !== item.cantidad) onPatch({ cantidad: v });
            }}
            className={`${celda} text-right font-mono`}
          />
        </td>
        <td className="px-1 py-1 align-top">
          <input
            defaultValue={item.unidad}
            onBlur={(e) => {
              if (e.target.value !== item.unidad)
                onPatch({ unidad: e.target.value || "UD" });
            }}
            className={celda}
          />
        </td>
        <td className="px-1 py-1 text-right align-top">
          <input
            type="number"
            key={`p-${item.precio_unitario}`}
            defaultValue={item.precio_unitario ?? ""}
            min={0}
            step="0.01"
            placeholder="—"
            disabled={descartado}
            title="Teclearlo lo vuelve precio manual; «buscar» cotiza del catálogo"
            onBlur={(e) => {
              const v = e.target.value === "" ? null : Number(e.target.value);
              if (v !== item.precio_unitario) onPatch({ precio_unitario: v });
            }}
            className={`${celda} text-right font-mono`}
          />
        </td>
        <td className="px-1 py-1 text-center align-top">
          <input
            type="checkbox"
            checked={item.itbis_aplica}
            disabled={descartado}
            onChange={(e) => onPatch({ itbis_aplica: e.target.checked })}
            title="ITBIS aplica"
          />
        </td>
        <td className="px-2 py-1.5 text-right align-top font-mono text-[12.5px] text-ink">
          {descartado ? "—" : t ? formatRD(t.subtotal) : "—"}
        </td>
        <td className="px-1 py-1 text-right align-top">
          <button
            type="button"
            onClick={onEliminar}
            disabled={pendiente}
            className="rounded p-1 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
            aria-label="Eliminar línea"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </td>
      </tr>

      {/* Segunda línea: lo que ofertamos + la vía del precio (como la
          descripción extendida de una línea en Odoo). */}
      <tr className={`border-b border-line ${descartado ? "opacity-60" : ""}`}>
        <td />
        <td colSpan={7} className="px-1 pb-2 pt-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="flex items-center gap-1 text-[11.5px] text-ink-soft">
              <input
                type="checkbox"
                checked={item.ofertamos}
                onChange={(e) => onPatch({ ofertamos: e.target.checked })}
              />
              Ofertamos
            </label>
            {descartado ? (
              <input
                defaultValue={item.motivo_descarte ?? ""}
                placeholder="Motivo del descarte (obligatorio)"
                onBlur={(e) => onPatch({ motivo_descarte: e.target.value || null })}
                className={`${celda} min-w-64 flex-1`}
              />
            ) : (
              <>
                <input
                  defaultValue={item.marca ?? ""}
                  placeholder="Marca"
                  onBlur={(e) => onPatch({ marca: e.target.value || null })}
                  className={`${celda} w-24`}
                />
                <input
                  defaultValue={item.modelo ?? ""}
                  placeholder="Modelo"
                  onBlur={(e) => onPatch({ modelo: e.target.value || null })}
                  className={`${celda} w-28`}
                />
                <input
                  defaultValue={item.descripcion ?? ""}
                  placeholder="Descripción de lo ofertado (afirmativa)"
                  onBlur={(e) => onPatch({ descripcion: e.target.value || null })}
                  className={`${celda} min-w-52 flex-1`}
                />
                {item.sku && (
                  <span className="whitespace-nowrap font-mono text-[10.5px] text-muted">
                    {item.sku} · {fmtUSD(item.costo_usd)} × {item.tasa} ·{" "}
                    {item.margen_modo === "margen" ? "margen" : "markup"} {item.margen_pct}%
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setBuscando(!buscando)}
                  className="flex items-center gap-1 whitespace-nowrap text-[11.5px] font-medium text-primary transition-colors hover:underline"
                >
                  {buscando ? (
                    <X className="h-3 w-3" strokeWidth={2} aria-hidden />
                  ) : (
                    <Search className="h-3 w-3" strokeWidth={2} aria-hidden />
                  )}
                  {buscando ? "Cerrar" : item.sku ? "Recotizar" : "Cotizar del catálogo"}
                </button>
              </>
            )}
          </div>
          {buscando && !descartado && <SelectorProducto onElegir={onCotizar} />}
        </td>
      </tr>
    </>
  );
}

// Buscador sobre el catálogo de Precios: elegir congela costo→tasa→margen→
// precio en la línea (snapshot).
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
    <div className="mt-1.5 rounded-md border border-line bg-surface p-2">
      <input
        autoFocus
        value={q}
        onChange={(e) => buscar(e.target.value)}
        placeholder="Buscar en el catálogo de precios (SKU o descripción)…"
        className="w-full rounded-md border border-line bg-surface px-2 py-1 text-[12.5px] text-ink outline-none focus:border-primary"
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
