"use client";

// Los ítems como COTIZADOR estilo Odoo: una tabla de líneas — descripción
// (la spec del pliego, tal cual), lo que ofertamos, cantidad, precio
// unitario, ITBIS y subtotal — con los totales abajo a la derecha. Cada
// celda edita en línea y guarda al salir. El precio sale del catálogo de
// Precios (snapshot congelado) o se teclea (manual).

import { useMemo, useRef, useState, useTransition } from "react";
import { Calculator, GripVertical, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { MicroGuardado, Panel, SectionTitle, btnPrimary } from "@/components/ui";
import { useAccion } from "@/lib/use-accion";
import { formatRD } from "@/lib/types";
import { fmtUSD } from "@/lib/precios/tipos";
import { buscarPreciosAction } from "@/lib/actions/precios";
import {
  actualizarItemAction,
  cotizarItemAction,
  crearItemAction,
  eliminarItemAction,
  reordenarItemsAction,
} from "@/lib/actions/licitaciones";
import type { LicItem, LicProceso } from "@/lib/licitaciones/tipos";
import {
  precioBaseUnitario,
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
  const [buscandoEn, setBuscandoEn] = useState<string | null>(null);
  // Alcance POR LÍNEA: guardar una celda no bloquea el resto de la tabla,
  // y el micro-check aparece junto al número de la línea que se guardó.
  const { correr, ocupada, okClave } = useAccion();

  // OPTIMISTA: la celda editada aplica al instante (totales incluidos) y se
  // guarda en el fondo SIN recargar la página — recargar todo el proceso por
  // una celda era lo que hacía eterno el cotizador con muchas líneas. Si el
  // servidor falla, se revierte y sale el aviso.
  const [parches, setParches] = useState<Record<string, Partial<LicItem>>>({});

  // Líneas recién creadas que el servidor todavía no devolvió en `items`: la
  // action responde con la fila creada y se pinta YA. Antes el botón solo se
  // deshabilitaba y la línea aparecía cuando terminaba el re-render completo
  // de la página — se sentía como que no había pasado nada y se hacía clic
  // otra vez. Se descartan en cuanto `items` las trae (o si se eliminan).
  const [nuevas, setNuevas] = useState<LicItem[]>([]);
  // Id de la última línea creada: su descripción recibe el cursor sola.
  const [recienCreada, setRecienCreada] = useState<string | null>(null);

  const agregando = ocupada("crear");

  function agregarLinea() {
    correr("crear", async () => {
      const r = await crearItemAction(proceso.id);
      if (r.item) {
        setNuevas((n) => [...n, r.item as LicItem]);
        setRecienCreada(r.item.id);
      }
      return r.error;
    });
  }

  function olvidarNueva(id: string) {
    setNuevas((n) => n.filter((x) => x.id !== id));
  }

  // ARRASTRAR PARA REORDENAR: el orden local manda al instante (optimista)
  // mientras el servidor persiste; el orden en pantalla es el del F.033.
  const [ordenLocal, setOrdenLocal] = useState<string[] | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);

  const mostrados = useMemo(() => {
    const conParche = items.map((i) => (parches[i.id] ? { ...i, ...parches[i.id] } : i));
    // Las creadas que el servidor ya devolvió salen de la lista optimista.
    const pendientes = nuevas.filter((n) => !items.some((i) => i.id === n.id));
    const base = pendientes.length ? [...conParche, ...pendientes] : conParche;
    if (!ordenLocal) return base;
    const porId = new Map(base.map((i) => [i.id, i]));
    const enOrden = ordenLocal
      .map((id) => porId.get(id))
      .filter(Boolean) as LicItem[];
    const fuera = base.filter((i) => !ordenLocal.includes(i.id));
    return [...enOrden, ...fuera];
  }, [items, nuevas, ordenLocal, parches]);

  function soltarSobre(targetId: string) {
    const origen = arrastrando;
    setArrastrando(null);
    setSobre(null);
    if (!origen || origen === targetId) return;
    const ids = mostrados.map((i) => i.id);
    const from = ids.indexOf(origen);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, origen); // subir = antes del destino; bajar = después
    setOrdenLocal(ids);
    correr("orden", () => reordenarItemsAction(proceso.id, ids));
  }

  const totales = totalesProceso(mostrados, params.itbisPct);
  const sinCotizar = mostrados.filter(
    (i) => i.ofertamos && i.precio_unitario === null,
  ).length;

  const patch = (id: string, p: Parameters<typeof actualizarItemAction>[1]) => {
    const previo = parches[id];
    setParches((m) => ({ ...m, [id]: { ...m[id], ...p } }));
    correr(`it-${id}`, () => actualizarItemAction(id, p), {
      sinRefresh: true,
      alTerminar: (err) => {
        if (err) setParches((m) => ({ ...m, [id]: previo ?? {} }));
      },
    });
  };

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
              disabled={agregando}
              onClick={agregarLinea}
              className={btnPrimary("!px-2.5 !py-1 !text-[12.5px]")}
            >
              {agregando ? (
                <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" strokeWidth={2.4} aria-hidden />
              ) : (
                <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
              )}
              Línea
            </button>
          </span>
        }
      >
        Ítems ({mostrados.length})
      </SectionTitle>

      {params.tasa === null && (
        <p className="mx-4 mt-3 rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
          Configura la tasa USD→DOP en Configuración → Empresa para cotizar del
          catálogo (el precio manual funciona igual).
        </p>
      )}

      {/* En móvil la tabla de 760px era ilegible (descripciones cortadas,
          edición a punta de scroll horizontal): bajo sm cada línea es una
          TARJETA apilada con los mismos campos y handlers. La tabla queda
          intacta para desktop. */}
      <div className="hidden overflow-x-auto sm:block">
        {/* table-fixed + colgroup: la descripción se queda con TODO el espacio
            sobrante (sin esto, las filas combinadas de abajo inflan las
            columnas chicas y la unidad termina más ancha que la descripción). */}
        <table className="w-full min-w-[760px] table-fixed text-sm">
          <colgroup>
            <col className="w-14" />
            <col />
            <col className="w-16" />
            <col className="w-14" />
            <col className="w-28" />
            <col className="w-24" />
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
              <th
                className="px-2 py-1.5 font-medium"
                title="Cómo viene el ITBIS en el precio tecleado: «+ ITBIS» (el precio es la base y el impuesto se suma), «incluido» (el precio ya lo trae; la base se despeja sola) o «exento» (licencias de software y derechos intangibles — Decreto 293-11, art. 4)."
              >
                ITBIS
              </th>
              <th className="px-2 py-1.5 text-right font-medium">Subtotal</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {mostrados.map((item) => (
              <Linea
                key={item.id}
                item={item}
                params={params}
                ocupada={ocupada(`it-${item.id}`)}
                ok={okClave === `it-${item.id}`}
                enDrag={arrastrando === item.id}
                esDestino={sobre === item.id && arrastrando !== null && arrastrando !== item.id}
                hayArrastre={arrastrando !== null}
                enfocar={recienCreada === item.id}
                buscando={buscandoEn === item.id}
                setBuscando={(v) => setBuscandoEn(v ? item.id : null)}
                onPatch={(p) => patch(item.id, p)}
                onArrastrar={() => setArrastrando(item.id)}
                onSobre={() => setSobre(item.id)}
                onSoltar={() => soltarSobre(item.id)}
                onFinArrastre={() => {
                  setArrastrando(null);
                  setSobre(null);
                }}
                onCotizar={(o) => {
                  setBuscandoEn(null);
                  correr(`it-${item.id}`, () => cotizarItemAction(item.id, o));
                }}
                onEliminar={() => {
                  if (confirm(`¿Eliminar la línea ${item.numero}?`)) {
                    olvidarNueva(item.id);
                    correr(`it-${item.id}`, () => eliminarItemAction(item.id));
                  }
                }}
              />
            ))}
            {/* Agregar donde termina el ojo (patrón Odoo), no solo arriba. */}
            {mostrados.length > 0 && (
              <tr>
                <td colSpan={8} className="px-2 py-1">
                  <button
                    type="button"
                    disabled={agregando}
                    onClick={agregarLinea}
                    className="flex w-full items-center gap-1.5 rounded px-1.5 py-1.5 text-left text-[12.5px] font-medium text-primary transition-colors hover:bg-surface-2 disabled:cursor-wait disabled:text-muted"
                  >
                    {agregando ? (
                      <Loader2
                        className="h-3.5 w-3.5 motion-safe:animate-spin"
                        strokeWidth={2.4}
                        aria-hidden
                      />
                    ) : (
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
                    )}
                    {agregando ? "Agregando…" : "Agregar línea"}
                  </button>
                </td>
              </tr>
            )}
            {mostrados.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center">
                  <p className="mb-3 text-sm text-muted">
                    Agrega las líneas del pliego — la descripción se pega TAL
                    CUAL aparece en el pliego.
                  </p>
                  <button
                    type="button"
                    disabled={agregando}
                    onClick={agregarLinea}
                    className={btnPrimary()}
                  >
                    {agregando ? (
                      <Loader2
                        className="h-4 w-4 motion-safe:animate-spin"
                        strokeWidth={2.4}
                        aria-hidden
                      />
                    ) : (
                      <Plus className="h-4 w-4" strokeWidth={2.4} aria-hidden />
                    )}
                    Primera línea
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Las líneas como tarjetas (solo móvil) */}
      <div className="divide-y divide-line sm:hidden">
        {mostrados.map((item) => (
          <TarjetaLinea
            key={item.id}
            item={item}
            params={params}
            ocupada={ocupada(`it-${item.id}`)}
            ok={okClave === `it-${item.id}`}
            enfocar={recienCreada === item.id}
            buscando={buscandoEn === item.id}
            setBuscando={(v) => setBuscandoEn(v ? item.id : null)}
            onPatch={(p) => patch(item.id, p)}
            onCotizar={(o) => {
              setBuscandoEn(null);
              correr(`it-${item.id}`, () => cotizarItemAction(item.id, o));
            }}
            onEliminar={() => {
              if (confirm(`¿Eliminar la línea ${item.numero}?`)) {
                olvidarNueva(item.id);
                correr(`it-${item.id}`, () => eliminarItemAction(item.id));
              }
            }}
          />
        ))}
        <div className="px-4 py-2">
          <button
            type="button"
            disabled={agregando}
            onClick={agregarLinea}
            className="flex w-full items-center gap-1.5 rounded px-1.5 py-2 text-left text-[13px] font-medium text-primary transition-colors hover:bg-surface-2 disabled:cursor-wait disabled:text-muted"
          >
            {agregando ? (
              <Loader2 className="h-4 w-4 motion-safe:animate-spin" strokeWidth={2.4} aria-hidden />
            ) : (
              <Plus className="h-4 w-4" strokeWidth={2.4} aria-hidden />
            )}
            {agregando
              ? "Agregando…"
              : mostrados.length === 0
                ? "Primera línea"
                : "Agregar línea"}
          </button>
        </div>
      </div>

      {/* Totales, estilo cotización */}
      {mostrados.length > 0 && (
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

// ¿El F.033 imprimirá LO OFERTADO o caerá a la spec del pliego? Solo con
// marca + modelo + descripción completos sale lo tuyo.
function productoIncompleto(item: LicItem): boolean {
  return !(item.marca && item.modelo && item.descripcion);
}

function Linea({
  item,
  params,
  ocupada,
  ok,
  enDrag,
  esDestino,
  hayArrastre,
  enfocar,
  buscando,
  setBuscando,
  onPatch,
  onArrastrar,
  onSobre,
  onSoltar,
  onFinArrastre,
  onCotizar,
  onEliminar,
}: {
  item: LicItem;
  params: ParamsCotizacion;
  // Estado de guardado de ESTA línea (clave it-<id> en useAccion).
  ocupada: boolean;
  ok: boolean;
  enDrag: boolean;
  esDestino: boolean;
  hayArrastre: boolean;
  /** Recién creada: el cursor cae solo en la descripción (una vez). */
  enfocar: boolean;
  buscando: boolean;
  setBuscando: (v: boolean) => void;
  onPatch: (p: Parameters<typeof actualizarItemAction>[1]) => void;
  onArrastrar: () => void;
  onSobre: () => void;
  onSoltar: () => void;
  onFinArrastre: () => void;
  onCotizar: (o: { suplidor_id: string; sku: string; costo_usd: number }) => void;
  onEliminar: () => void;
}) {
  const filaRef = useRef<HTMLTableRowElement>(null);
  // El ref del textarea corre en cada render: sin este candado, la línea nueva
  // se robaría el cursor cada vez que la tabla se repinta (mientras tecleas).
  const yaEnfocada = useRef(false);
  const t = totalesItem(item, params.itbisPct);
  const descartado = !item.ofertamos;

  // El drop cae sobre cualquiera de las dos sub-filas de la línea.
  const propsDestino = {
    onDragOver: (e: React.DragEvent) => {
      if (!hayArrastre) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      onSobre();
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      onSoltar();
    },
  };
  const claseDrag = enDrag ? "opacity-40" : esDestino ? "bg-primary/10" : "";

  return (
    <>
      <tr
        ref={filaRef}
        className={`group border-b border-line ${descartado ? "opacity-50" : ""} ${claseDrag}`}
        {...propsDestino}
      >
        <td className="px-1 py-1 align-top">
          <span className="flex items-center gap-1">
            {/* ARRASTRA el asa para reordenar: este orden es el del F.033.
                El # del pliego no cambia (identidad, no posición). */}
            <span
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", item.id);
                e.dataTransfer.effectAllowed = "move";
                if (filaRef.current) e.dataTransfer.setDragImage(filaRef.current, 16, 16);
                onArrastrar();
              }}
              onDragEnd={onFinArrastre}
              className="cursor-grab touch-none rounded text-muted opacity-0 transition-opacity hover:text-ink active:cursor-grabbing group-hover:opacity-100"
              title="Arrastra para cambiar el orden (es el orden del F.033)"
              aria-label={`Arrastrar la línea ${item.numero}`}
            >
              <GripVertical className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </span>
            <span className="font-mono text-xs font-semibold text-muted">{item.numero}</span>
            {/* Guardando/guardado de ESTA línea, junto a su número. */}
            <MicroGuardado activo={ocupada} ok={ok} />
          </span>
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
                if (enfocar && !yaEnfocada.current) {
                  yaEnfocada.current = true;
                  el.focus();
                }
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
        <td className="px-1 py-1 align-top">
          <select
            value={item.itbis_modo}
            disabled={descartado}
            onChange={(e) => onPatch({ itbis_modo: e.target.value as LicItem["itbis_modo"] })}
            title="«+ ITBIS»: el precio es la base y el impuesto se suma. «incluido»: el precio ya trae el ITBIS — la base se despeja sola para el F.033. «exento»: sin ITBIS (licencias e intangibles, Decreto 293-11)."
            className={`${celda} cursor-pointer`}
          >
            <option value="mas">+ ITBIS</option>
            <option value="incluido">incluido</option>
            <option value="exento">exento</option>
          </select>
        </td>
        <td className="px-2 py-1.5 text-right align-top font-mono text-[12.5px] text-ink">
          {descartado ? "—" : t ? formatRD(t.subtotal) : "—"}
          {!descartado && t && item.itbis_modo === "incluido" && item.precio_unitario !== null && (
            <span
              className="block text-[10px] font-normal text-muted"
              title="La base sin ITBIS que imprime la oferta económica"
            >
              base {formatRD(precioBaseUnitario(item.precio_unitario, item.itbis_modo, params.itbisPct))}/u
            </span>
          )}
        </td>
        <td className="px-1 py-1 text-right align-top">
          <button
            type="button"
            onClick={onEliminar}
            disabled={ocupada}
            className="rounded p-1 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
            aria-label="Eliminar línea"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </td>
      </tr>

      {/* Segunda línea: lo que ofertamos + la vía del precio (como la
          descripción extendida de una línea en Odoo). */}
      <tr
        className={`border-b border-line ${descartado ? "opacity-60" : ""} ${claseDrag}`}
        {...propsDestino}
      >
        <td />
        <td colSpan={7} className="px-1 pb-2 pt-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="flex items-center gap-1 text-[11.5px] text-ink-soft">
              <input
                type="checkbox"
                defaultChecked={item.ofertamos}
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
                {productoIncompleto(item) && (
                  <span
                    className="whitespace-nowrap rounded bg-warn-soft px-1.5 py-0.5 text-[10.5px] font-medium text-warn"
                    title="El F.033 imprime marca + modelo + descripción de lo ofertado. Mientras falte alguno de los tres, esta línea saldrá con la descripción del pliego tal cual."
                  >
                    saldrá la spec del pliego
                  </span>
                )}
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

// La línea como TARJETA (solo móvil): mismos campos y handlers que la fila
// de la tabla, apilados a lo ancho — la descripción se lee completa y cada
// campo es tocable. Sin drag&drop (reordenar es tarea de desktop).
const campoMovil =
  "w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] text-ink outline-none focus:border-primary";

function TarjetaLinea({
  item,
  params,
  ocupada,
  ok,
  enfocar,
  buscando,
  setBuscando,
  onPatch,
  onCotizar,
  onEliminar,
}: {
  item: LicItem;
  params: ParamsCotizacion;
  ocupada: boolean;
  ok: boolean;
  /** Recién creada: el cursor cae solo en la descripción (una vez). */
  enfocar: boolean;
  buscando: boolean;
  setBuscando: (v: boolean) => void;
  onPatch: (p: Parameters<typeof actualizarItemAction>[1]) => void;
  onCotizar: (o: { suplidor_id: string; sku: string; costo_usd: number }) => void;
  onEliminar: () => void;
}) {
  const yaEnfocada = useRef(false);
  const t = totalesItem(item, params.itbisPct);
  const descartado = !item.ofertamos;

  return (
    <div className={`space-y-2 px-4 py-3 ${descartado ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[13px] font-semibold text-muted">#{item.numero}</span>
        <MicroGuardado activo={ocupada} ok={ok} />
        <span className="ml-auto font-mono text-[13px] font-semibold text-ink">
          {descartado ? "—" : t ? formatRD(t.subtotal) : "—"}
        </span>
        <button
          type="button"
          onClick={onEliminar}
          disabled={ocupada}
          className="rounded p-1.5 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
          aria-label="Eliminar línea"
        >
          <Trash2 className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      <textarea
        defaultValue={item.spec_cruda}
        placeholder="Descripción tal cual el pliego…"
        rows={2}
        ref={(el) => {
          if (el) {
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
            if (enfocar && !yaEnfocada.current) {
              yaEnfocada.current = true;
              el.focus();
            }
          }
        }}
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = "auto";
          el.style.height = `${el.scrollHeight}px`;
        }}
        onBlur={(e) => {
          if (e.target.value !== item.spec_cruda) onPatch({ spec_cruda: e.target.value });
        }}
        className={`${campoMovil} resize-none overflow-hidden leading-snug`}
      />

      <div className="grid grid-cols-3 gap-2">
        <label className="block text-[11px] text-muted">
          Cant
          <input
            type="number"
            defaultValue={item.cantidad}
            min={0.01}
            step="0.01"
            onBlur={(e) => {
              const v = Number(e.target.value) || 1;
              if (v !== item.cantidad) onPatch({ cantidad: v });
            }}
            className={`${campoMovil} mt-0.5 text-right font-mono`}
          />
        </label>
        <label className="block text-[11px] text-muted">
          Unidad
          <input
            defaultValue={item.unidad}
            onBlur={(e) => {
              if (e.target.value !== item.unidad) onPatch({ unidad: e.target.value || "UD" });
            }}
            className={`${campoMovil} mt-0.5`}
          />
        </label>
        <label className="block text-[11px] text-muted">
          Precio unit.
          <input
            type="number"
            key={`pm-${item.precio_unitario}`}
            defaultValue={item.precio_unitario ?? ""}
            min={0}
            step="0.01"
            placeholder="—"
            disabled={descartado}
            onBlur={(e) => {
              const v = e.target.value === "" ? null : Number(e.target.value);
              if (v !== item.precio_unitario) onPatch({ precio_unitario: v });
            }}
            className={`${campoMovil} mt-0.5 text-right font-mono`}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={item.itbis_modo}
          disabled={descartado}
          onChange={(e) => onPatch({ itbis_modo: e.target.value as LicItem["itbis_modo"] })}
          className={`${campoMovil} w-auto cursor-pointer`}
        >
          <option value="mas">+ ITBIS</option>
          <option value="incluido">ITBIS incluido</option>
          <option value="exento">exento</option>
        </select>
        <label className="flex items-center gap-1.5 text-[13px] text-ink-soft">
          <input
            type="checkbox"
            defaultChecked={item.ofertamos}
            onChange={(e) => onPatch({ ofertamos: e.target.checked })}
          />
          Ofertamos
        </label>
      </div>

      {descartado ? (
        <input
          defaultValue={item.motivo_descarte ?? ""}
          placeholder="Motivo del descarte (obligatorio)"
          onBlur={(e) => onPatch({ motivo_descarte: e.target.value || null })}
          className={campoMovil}
        />
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              defaultValue={item.marca ?? ""}
              placeholder="Marca"
              onBlur={(e) => onPatch({ marca: e.target.value || null })}
              className={campoMovil}
            />
            <input
              defaultValue={item.modelo ?? ""}
              placeholder="Modelo"
              onBlur={(e) => onPatch({ modelo: e.target.value || null })}
              className={campoMovil}
            />
          </div>
          <input
            defaultValue={item.descripcion ?? ""}
            placeholder="Descripción de lo ofertado (afirmativa)"
            onBlur={(e) => onPatch({ descripcion: e.target.value || null })}
            className={campoMovil}
          />
          <div className="flex flex-wrap items-center gap-2">
            {productoIncompleto(item) && (
              <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[10.5px] font-medium text-warn">
                saldrá la spec del pliego
              </span>
            )}
            <button
              type="button"
              onClick={() => setBuscando(!buscando)}
              className="flex items-center gap-1 text-[13px] font-medium text-primary"
            >
              {buscando ? (
                <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              ) : (
                <Search className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              )}
              {buscando ? "Cerrar" : item.sku ? "Recotizar" : "Cotizar del catálogo"}
            </button>
          </div>
          {item.sku && (
            <p className="font-mono text-[11px] text-muted">
              {item.sku} · {fmtUSD(item.costo_usd)} × {item.tasa} ·{" "}
              {item.margen_modo === "margen" ? "margen" : "markup"} {item.margen_pct}%
            </p>
          )}
          {buscando && <SelectorProducto onElegir={onCotizar} />}
        </div>
      )}
    </div>
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
  const [buscando, startTransition] = useTransition();

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
      <div className="relative">
        <input
          autoFocus
          value={q}
          onChange={(e) => buscar(e.target.value)}
          placeholder="Buscar en el catálogo de precios (SKU o descripción)…"
          className="w-full rounded-md border border-line bg-surface px-2 py-1 pr-7 text-[12.5px] text-ink outline-none focus:border-primary"
        />
        {buscando && (
          <Loader2
            className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 motion-safe:animate-spin text-muted"
            strokeWidth={2.2}
            aria-hidden
          />
        )}
      </div>
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
