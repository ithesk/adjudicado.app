"use client";

// Peek lateral de un producto: precio, propiedades, resaltado, precios por
// término de contrato, historial entre listas, calculadora de margen y
// comentarios del equipo (portado de ListApp al sistema de adjudicado).

import { useCallback, useEffect, useState } from "react";
import {
  X, Truck, Tag, Package, Clock, Calendar, Copy, Check,
  Calculator, MessageSquare, Highlighter, Trash2, Send,
} from "lucide-react";
import {
  comentarPrecioAction,
  eliminarComentarioPrecioAction,
  marcarPrecioAction,
} from "@/lib/actions/precios";
import {
  fmtUSD,
  fmtTermino,
  MARCA_COLORES,
  marcaDot,
  type ComentarioPrecio,
  type DetallePrecio,
  type ProductoPrecio,
} from "@/lib/precios/tipos";
import { Avatar } from "@/components/ui";

interface ProductoPeekProps {
  producto: ProductoPrecio;
  detalle: DetallePrecio | null;
  onClose: () => void;
  onAnotado?: () => void;
}

export default function ProductoPeek({
  producto,
  detalle,
  onClose,
  onAnotado,
}: ProductoPeekProps) {
  const [color, setColor] = useState<string | null>(producto.marca_color);
  const [comentarios, setComentarios] = useState<ComentarioPrecio[] | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Marca y comentarios llegan con el detalle (una sola llamada al servidor).
  // Se sincronizan durante el render, no en un efecto.
  const [prevDetalle, setPrevDetalle] = useState<DetallePrecio | null>(null);
  if (detalle !== prevDetalle) {
    setPrevDetalle(detalle);
    if (detalle) {
      setColor(detalle.marca);
      setComentarios(detalle.comentarios);
    } else {
      setComentarios(null);
    }
  }

  const cambiarColor = (c: string | null) => {
    const siguiente = c === color ? null : c;
    setColor(siguiente);
    marcarPrecioAction(producto.suplidor_id, producto.sku, siguiente)
      .then(() => onAnotado?.())
      .catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 animate-fade-in bg-black/30" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-full animate-slide-in-right flex-col border-l border-line bg-surface shadow-raised sm:w-[600px]">
        <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {color && (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: marcaDot(color) }}
                />
              )}
              <h2 className="truncate font-mono text-lg font-semibold tracking-tight text-ink">
                {producto.sku}
              </h2>
              <BotonCopiar texto={producto.sku} title="Copiar SKU" />
            </div>
            {producto.descripcion && (
              <p className="mt-0.5 text-sm text-ink-soft">{producto.descripcion}</p>
            )}
            {producto.descripcion2 && (
              <p className="text-xs text-muted">{producto.descripcion2}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold tabular-nums text-ink">
                {fmtUSD(producto.precio)}
              </span>
              {producto.term_meses !== null && (
                <span className="text-sm text-muted">{fmtTermino(producto.term_meses)}</span>
              )}
            </div>
            <BotonCopiar
              texto={`${producto.sku}\t${producto.descripcion ?? ""}\t${producto.precio ?? ""}`}
              title="Copiar línea (SKU + descripción + precio)"
              label="Copiar línea"
            />
          </div>

          {/* Resaltado */}
          <div className="mb-5 flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <Highlighter className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Resaltar:
            </span>
            {MARCA_COLORES.map((c) => (
              <button
                key={c.id}
                type="button"
                title={c.label}
                onClick={() => cambiarColor(c.id)}
                className={`grid h-6 w-6 place-items-center rounded-full transition-transform hover:scale-110 ${
                  color === c.id ? "ring-2 ring-offset-1 ring-offset-surface" : ""
                }`}
                style={
                  color === c.id
                    ? ({ "--tw-ring-color": c.dot } as React.CSSProperties)
                    : undefined
                }
              >
                <span className="h-4 w-4 rounded-full" style={{ background: c.dot }} />
              </button>
            ))}
            {color && (
              <button
                type="button"
                onClick={() => cambiarColor(null)}
                className="text-xs text-muted transition-colors hover:text-ink"
              >
                Quitar
              </button>
            )}
          </div>

          <dl className="flex flex-col divide-y divide-line rounded-lg border border-line">
            <FilaPropiedad icon={<Truck className="h-[15px] w-[15px]" strokeWidth={2} />} label="Suplidor" value={producto.suplidor_nombre} />
            <FilaPropiedad icon={<Tag className="h-[15px] w-[15px]" strokeWidth={2} />} label="Familia" value={producto.familia ?? "—"} />
            <FilaPropiedad icon={<Package className="h-[15px] w-[15px]" strokeWidth={2} />} label="Categoría" value={producto.categoria ?? "—"} />
            <FilaPropiedad icon={<Clock className="h-[15px] w-[15px]" strokeWidth={2} />} label="Término" value={fmtTermino(producto.term_meses) || "—"} />
            <FilaPropiedad icon={<Calendar className="h-[15px] w-[15px]" strokeWidth={2} />} label="Vigencia" value={producto.vigencia ?? "—"} />
          </dl>

          <CalculadoraMargen precioLista={producto.precio} />

          {!detalle && (
            <p className="mt-6 text-center text-sm text-muted">Cargando detalles…</p>
          )}

          {detalle && detalle.variantes.length > 1 && (
            <div className="mt-6">
              <h3 className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
                Precios por tiempo de contrato{" "}
                <span className="normal-case tracking-normal">(base {detalle.base_sku})</span>
              </h3>
              <div className="overflow-hidden rounded-lg border border-line">
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface-2 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                      <th className="px-3 py-2 font-medium">SKU / Detalle</th>
                      <th className="w-[76px] px-3 py-2 font-medium">Término</th>
                      <th className="w-[110px] px-3 py-2 text-right font-medium">Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.variantes.map((v) => (
                      <tr
                        key={v.id}
                        className={`border-b border-line last:border-0 ${
                          v.sku === producto.sku ? "bg-primary/10" : ""
                        }`}
                      >
                        <td className="px-3 py-2">
                          <div className="truncate font-mono text-xs text-ink" title={v.sku}>
                            {v.sku}
                          </div>
                          <div
                            className="truncate text-xs text-muted"
                            title={v.descripcion2 ?? v.descripcion ?? ""}
                          >
                            {v.descripcion2 ?? v.descripcion}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-soft">
                          {fmtTermino(v.term_meses)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-ink">
                          {fmtUSD(v.precio)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {detalle && detalle.historial.length > 1 && (
            <div className="mt-6">
              <h3 className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
                Historial de precios (listas importadas)
              </h3>
              <div className="overflow-hidden rounded-lg border border-line">
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface-2 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                      <th className="px-3 py-2 font-medium">Lista</th>
                      <th className="w-[96px] px-3 py-2 font-medium">Vigencia</th>
                      <th className="w-[110px] px-3 py-2 text-right font-medium">Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.historial.map((h, i) => (
                      <tr key={i} className="border-b border-line last:border-0">
                        <td className="px-3 py-2 text-xs">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-ink" title={h.filename ?? ""}>
                              {h.filename ?? "—"}
                            </span>
                            {h.is_active && (
                              <span className="shrink-0 rounded bg-ok-soft px-1.5 py-0.5 text-[10px] text-ok">
                                actual
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-soft">
                          {h.vigencia ?? h.importada_at.slice(0, 10)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-ink">
                          {fmtUSD(h.precio)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <Comentarios
            producto={producto}
            comentarios={comentarios}
            setComentarios={setComentarios}
            onAnotado={onAnotado}
          />
        </div>
      </div>
    </div>
  );
}

function FilaPropiedad({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 text-sm">
      <div className="flex w-28 shrink-0 items-center gap-2 text-muted">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="min-w-0 flex-1 truncate text-ink">{value}</div>
    </div>
  );
}

function BotonCopiar({ texto, title, label }: { texto: string; title: string; label?: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = useCallback(() => {
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1200);
    });
  }, [texto]);
  return (
    <button
      type="button"
      onClick={copiar}
      title={title}
      className={`flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors ${
        copiado ? "text-ok" : "text-muted hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {copiado ? (
        <Check className="h-[13px] w-[13px]" strokeWidth={2} />
      ) : (
        <Copy className="h-[13px] w-[13px]" strokeWidth={2} />
      )}
      {label && <span>{copiado ? "Copiado" : label}</span>}
    </button>
  );
}

function num(v: string, fallback = 0): number {
  const n = Number(v.replace(",", "."));
  return isFinite(n) ? n : fallback;
}

// El peek solo se monta en el cliente (tras un clic), así que leer
// localStorage en el inicializador del estado es seguro.
function calcGuardada(): { descuento?: number; margen?: number } {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem("adjudicado:precios:calc") ?? "{}");
  } catch {
    return {};
  }
}

function CalculadoraMargen({ precioLista }: { precioLista: number | null }) {
  const [cantidad, setCantidad] = useState("1");
  const [descuento, setDescuento] = useState(() => {
    const s = calcGuardada();
    return s.descuento ? String(s.descuento) : "0";
  });
  const [margen, setMargen] = useState(() => {
    const s = calcGuardada();
    return s.margen ? String(s.margen) : "0";
  });

  useEffect(() => {
    localStorage.setItem(
      "adjudicado:precios:calc",
      JSON.stringify({ descuento: num(descuento), margen: num(margen) }),
    );
  }, [descuento, margen]);

  if (precioLista === null) return null;

  const q = Math.max(1, Math.floor(num(cantidad, 1)));
  const d = Math.min(99.9, Math.max(0, num(descuento)));
  const m = Math.min(99.9, Math.max(0, num(margen)));
  const costoUnit = precioLista * (1 - d / 100);
  const ventaUnit = m > 0 ? costoUnit / (1 - m / 100) : costoUnit;
  const ganancia = (ventaUnit - costoUnit) * q;

  const field =
    "w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm tabular-nums text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-[var(--ring)]";

  return (
    <div className="mt-6">
      <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
        <Calculator className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Calculadora
      </h3>
      <div className="rounded-lg border border-line p-3">
        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Cantidad
            <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Descuento %
            <input type="number" min={0} max={99.9} step="0.1" value={descuento} onChange={(e) => setDescuento(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Margen %
            <input type="number" min={0} max={99.9} step="0.1" value={margen} onChange={(e) => setMargen(e.target.value)} className={field} />
          </label>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-line pt-3 text-sm sm:grid-cols-4">
          <StatCalc label="Costo unit." value={fmtUSD(costoUnit)} />
          <StatCalc label={`Costo × ${q}`} value={fmtUSD(costoUnit * q)} />
          <StatCalc label="Venta unit." value={fmtUSD(ventaUnit)} accent />
          <StatCalc label="Ganancia" value={fmtUSD(ganancia)} ok={ganancia > 0} />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Costo = precio de lista − descuento del suplidor. Venta = costo ÷ (1 − margen).
          Los porcentajes se recuerdan para el próximo producto.
        </p>
      </div>
    </div>
  );
}

function StatCalc({
  label,
  value,
  accent,
  ok,
}: {
  label: string;
  value: string;
  accent?: boolean;
  ok?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-muted">{label}</span>
      <span
        className={`font-semibold tabular-nums ${
          accent ? "text-primary" : ok ? "text-ok" : "text-ink"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Comentarios({
  producto,
  comentarios,
  setComentarios,
  onAnotado,
}: {
  producto: ProductoPrecio;
  comentarios: ComentarioPrecio[] | null;
  setComentarios: React.Dispatch<React.SetStateAction<ComentarioPrecio[] | null>>;
  onAnotado?: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const cuerpo = texto.trim();
    if (!cuerpo || enviando) return;
    setEnviando(true);
    comentarPrecioAction(producto.suplidor_id, producto.sku, cuerpo)
      .then((c) => {
        if (c) {
          setComentarios((prev) => [c, ...(prev ?? [])]);
          setTexto("");
          onAnotado?.();
        }
      })
      .finally(() => setEnviando(false));
  };

  const eliminar = (id: string) => {
    setComentarios((prev) => (prev ?? []).filter((c) => c.id !== id));
    eliminarComentarioPrecioAction(id)
      .then(() => onAnotado?.())
      .catch(() => {});
  };

  return (
    <div className="mt-6 pb-2">
      <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
        <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Comentarios del equipo
        {comentarios && comentarios.length > 0 && (
          <span className="rounded-full bg-surface-2 px-1.5 text-[11px] text-ink-soft">
            {comentarios.length}
          </span>
        )}
      </h3>

      <form onSubmit={enviar} className="mb-3 flex gap-2">
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe una nota… ej: pedir precio especial al mayorista"
          className="flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-[var(--ring)]"
        />
        <button
          type="submit"
          disabled={enviando || !texto.trim()}
          aria-label="Enviar comentario"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-primary-ink transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </form>

      {comentarios === null ? (
        <p className="text-xs text-muted">Cargando comentarios…</p>
      ) : comentarios.length === 0 ? (
        <p className="text-xs text-muted">
          Sin comentarios aún. Las notas se comparten con todo el equipo y sobreviven a
          las actualizaciones de listas.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {comentarios.map((c) => (
            <li
              key={c.id}
              className="group flex items-start gap-2.5 rounded-lg border border-line px-3 py-2"
            >
              <Avatar nombre={c.autor} size={22} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 text-[11px] text-muted">
                  <span className="font-medium text-ink-soft">{c.autor ?? "Alguien"}</span>
                  <span>{c.created_at.slice(0, 16).replace("T", " ")}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm text-ink">{c.texto}</p>
              </div>
              <button
                type="button"
                onClick={() => eliminar(c.id)}
                aria-label="Eliminar comentario"
                className="mt-0.5 shrink-0 rounded p-1 text-muted opacity-0 transition-all hover:bg-surface-2 hover:text-danger group-hover:opacity-100"
              >
                <Trash2 className="h-[13px] w-[13px]" strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
