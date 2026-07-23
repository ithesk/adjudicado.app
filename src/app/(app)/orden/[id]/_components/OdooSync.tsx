"use client";

import { useTransition } from "react";
import { RefreshCw, CheckCircle2, AlertCircle, Clock, Ban, Link2, Loader2, X } from "lucide-react";
import {
  listarFacturasOdoo,
  sincronizarFacturaOdoo,
  vincularFacturaOdoo,
} from "@/lib/actions/odoo";
import type { FacturaResumen } from "@/lib/odoo";
import { formatRD } from "@/lib/types";
import { useState } from "react";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type EstadoOdoo =
  | "paid"
  | "partial"
  | "not_paid"
  | "in_payment"
  | "reversed"
  | "draft"
  | (string & {});

interface OdooSyncProps {
  ordenId: string;
  numeroOc: string;
  /** Estado de pago actual guardado en BD (puede ser null si no se ha sincronizado). */
  facturaEstado: string | null;
  /** ID de la factura en Odoo (para referencia; puede ser null). */
  facturaId: number | null;
  /** Nombre de la factura en Odoo (p. ej. "INV/2026/00042"). */
  facturaNombre: string | null;
}

// ── Chip de estado ────────────────────────────────────────────────────────────

function chipClases(estado: EstadoOdoo): string {
  switch (estado) {
    case "paid":
      return "bg-ok/10 text-ok border-ok/20";
    case "partial":
    case "in_payment":
      return "bg-warn/10 text-warn border-warn/20";
    case "reversed":
    case "draft":
      return "bg-surface-2 text-muted border-line";
    case "not_paid":
    default:
      return "bg-surface-2 text-muted border-line";
  }
}

function chipIcono(estado: EstadoOdoo) {
  switch (estado) {
    case "paid":
      return <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />;
    case "partial":
    case "in_payment":
      return <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />;
    case "reversed":
      return <Ban className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />;
    case "not_paid":
    default:
      return <AlertCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />;
  }
}

function etiquetaEstado(estado: EstadoOdoo): string {
  switch (estado) {
    case "paid":
      return "Pagada";
    case "partial":
      return "Pago parcial";
    case "in_payment":
      return "En proceso de pago";
    case "not_paid":
      return "No pagada";
    case "reversed":
      return "Revertida";
    case "draft":
      return "Borrador";
    default:
      return estado;
  }
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function OdooSync({
  ordenId,
  facturaEstado: estadoInicial,
  facturaId: idInicial,
  facturaNombre: nombreInicial,
}: OdooSyncProps) {
  const [pending, startTransition] = useTransition();
  const [estado, setEstado] = useState<string | null>(estadoInicial);
  const [nombre, setNombre] = useState<string | null>(nombreInicial);
  const [facturaId, setFacturaId] = useState<number | null>(idInicial);
  const [mensaje, setMensaje] = useState<string | null>(null);
  // El selector de facturas recientes (cuando la OC no aparece en Odoo).
  const [candidatas, setCandidatas] = useState<FacturaResumen[] | null>(null);
  const [cargandoLista, setCargandoLista] = useState(false);

  function aplicar(res: Awaited<ReturnType<typeof sincronizarFacturaOdoo>>) {
    if (!res) return; // modo demo
    if (!res.ok) {
      setMensaje(res.error ?? "Error al sincronizar.");
      return;
    }
    if (!res.factura) {
      setMensaje("Sin factura para esta OC en Odoo — vincúlala de la lista.");
      return;
    }
    setEstado(res.factura.estado);
    setNombre(res.factura.name);
    setFacturaId(res.factura.id);
    setMensaje(null);
  }

  function sincronizar() {
    setMensaje(null);
    startTransition(async () => aplicar(await sincronizarFacturaOdoo(ordenId)));
  }

  function abrirLista() {
    setMensaje(null);
    setCargandoLista(true);
    startTransition(async () => {
      const r = await listarFacturasOdoo();
      setCargandoLista(false);
      if (!r.ok) {
        setMensaje(r.error);
        return;
      }
      if (r.facturas.length === 0) {
        setMensaje("No hay facturas de cliente en tu Odoo todavía.");
        return;
      }
      setCandidatas(r.facturas);
    });
  }

  function vincular(id: number) {
    setCandidatas(null);
    startTransition(async () => aplicar(await vincularFacturaOdoo(ordenId, id)));
  }

  return (
    <div className="space-y-2">
      {/* Chip de estado actual */}
      {estado ? (
        <div className="flex flex-col gap-1">
          <span
            className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium ${chipClases(estado)}`}
          >
            {chipIcono(estado)}
            {etiquetaEstado(estado)}
          </span>
          {nombre && <p className="text-[11px] text-muted">{nombre}</p>}
        </div>
      ) : (
        <p className="text-[12px] text-muted">Sin factura vinculada.</p>
      )}

      {/* Mensaje de resultado */}
      {mensaje && <p className="text-[12px] text-muted">{mensaje}</p>}

      {/* El selector de facturas recientes */}
      {candidatas && (
        <div className="overflow-hidden rounded-md border border-line">
          <p className="flex items-center justify-between border-b border-line bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
            Elige la factura de esta orden
            <button type="button" onClick={() => setCandidatas(null)} aria-label="Cerrar">
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </p>
          <ul className="max-h-56 divide-y divide-line overflow-y-auto">
            {candidatas.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => vincular(f.id)}
                  className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-ink">
                      {f.name} · {formatRD(f.montoTotal)}
                    </span>
                    <span className="block truncate text-[11px] text-muted">
                      {f.cliente}
                      {f.fecha ? ` · ${f.fecha.slice(8, 10)}/${f.fecha.slice(5, 7)}/${f.fecha.slice(0, 4)}` : ""}
                      {" · "}
                      {etiquetaEstado(f.estado)}
                    </span>
                  </span>
                  <Link2 className="h-3.5 w-3.5 flex-none text-muted" strokeWidth={2} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={sincronizar}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink disabled:opacity-55"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${pending && !cargandoLista ? "animate-spin" : ""}`}
            strokeWidth={2}
            aria-hidden
          />
          {facturaId ? "Actualizar estado" : "Buscar por número de OC"}
        </button>
        <button
          type="button"
          onClick={abrirLista}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink disabled:opacity-55"
        >
          {cargandoLista ? (
            <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" strokeWidth={2} aria-hidden />
          ) : (
            <Link2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          )}
          {facturaId ? "Cambiar factura…" : "Elegir factura de Odoo…"}
        </button>
      </div>
    </div>
  );
}
