"use client";

import { useTransition } from "react";
import { RefreshCw, CheckCircle2, AlertCircle, Clock, Ban } from "lucide-react";
import { sincronizarFacturaOdoo } from "@/lib/actions/odoo";
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
  const [_facturaId] = useState<number | null>(idInicial);
  const [mensaje, setMensaje] = useState<string | null>(null);

  function sincronizar() {
    setMensaje(null);
    startTransition(async () => {
      const res = await sincronizarFacturaOdoo(ordenId);
      if (!res) return; // modo demo
      if (!res.ok) {
        setMensaje(res.error ?? "Error al sincronizar.");
        return;
      }
      if (!res.factura) {
        setMensaje("No se encontró factura para esta OC.");
        return;
      }
      setEstado(res.factura.estado);
      setNombre(res.factura.name);
      setMensaje(null);
    });
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
          {nombre && (
            <p className="text-[11px] text-muted">{nombre}</p>
          )}
        </div>
      ) : (
        <p className="text-[12px] text-muted">Sin factura sincronizada.</p>
      )}

      {/* Mensaje de resultado */}
      {mensaje && (
        <p className="text-[12px] text-muted">{mensaje}</p>
      )}

      {/* Botón de sincronización */}
      <button
        type="button"
        onClick={sincronizar}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink disabled:opacity-55"
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`}
          strokeWidth={2}
          aria-hidden
        />
        {pending ? "Buscando..." : "Sincronizar con Odoo"}
      </button>
    </div>
  );
}
