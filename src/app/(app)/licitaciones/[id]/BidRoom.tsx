"use client";

// La "Bid Room": todo el expediente de una licitación en una pantalla —
// cuenta regresiva al cierre, ítems con su cotización, y el checklist de
// requisitos con el flag subsanable/no-subsanable bien visible.

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  PackageOpen,
  ShieldAlert,
} from "lucide-react";
import { Panel, btnGhost } from "@/components/ui";
import { diasRestantes, formatRD, nivelUrgencia } from "@/lib/types";
import { urgenciaChip, textoDias } from "@/lib/ui";
import {
  ESTADOS_LICITACION,
  ESTADO_LIC_LABEL,
  MODALIDAD_LABEL,
  noSubsanablesPendientes,
  type ProcesoDetalle,
} from "@/lib/licitaciones/tipos";
import { totalesProceso, type ParamsCotizacion } from "@/lib/licitaciones/cotizador";
import {
  actualizarProcesoAction,
  validarCanonicoAction,
} from "@/lib/actions/licitaciones";
import ItemsPanel from "./_components/ItemsPanel";
import RequisitosPanel from "./_components/RequisitosPanel";

export default function BidRoom({
  detalle,
  params,
  tieneFirmantes,
  tienePerfil,
}: {
  detalle: ProcesoDetalle;
  params: ParamsCotizacion;
  tieneFirmantes: boolean;
  tienePerfil: boolean;
}) {
  const router = useRouter();
  const { proceso, items, requisitos, institucion } = detalle;
  const [validacion, setValidacion] = useState<string[] | "ok" | null>(null);
  const [validando, startValidacion] = useTransition();

  const dias = diasRestantes(proceso.cierre ? proceso.cierre.slice(0, 10) : null);
  const nivel = nivelUrgencia(dias);
  const criticosPendientes = noSubsanablesPendientes(requisitos);
  const totales = totalesProceso(items, params.itbisPct);

  function validar() {
    startValidacion(async () => {
      const r = await validarCanonicoAction(proceso.id);
      setValidacion(r.errores ?? "ok");
    });
  }

  function cambiarEstado(estado: string) {
    startValidacion(async () => {
      await actualizarProcesoAction(proceso.id, {
        estado: estado as ProcesoDetalle["proceso"]["estado"],
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Cabecera del proceso */}
      <Panel className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold text-ink">{proceso.codigo}</p>
            <p className="text-[13px] text-muted">
              {institucion?.nombre ?? "Sin entidad"} ·{" "}
              {MODALIDAD_LABEL[proceso.modalidad] ?? proceso.modalidad}
            </p>
            {proceso.objeto && (
              <p className="mt-1 max-w-xl text-[13px] text-ink-soft">{proceso.objeto}</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className={`rounded px-2 py-1 font-mono text-sm font-semibold ${urgenciaChip(nivel)}`}>
                {textoDias(dias)}
              </span>
              {proceso.cierre && (
                <p className="mt-1 text-[11px] text-muted">
                  Cierre:{" "}
                  {new Date(proceso.cierre).toLocaleString("es-DO", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
            </div>
            <select
              value={proceso.estado}
              onChange={(e) => cambiarEstado(e.target.value)}
              className="rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus:border-primary"
            >
              {ESTADOS_LICITACION.map((e) => (
                <option key={e} value={e}>
                  {ESTADO_LIC_LABEL[e]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* El contador del gate: los no-subsanables mandan. */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {criticosPendientes > 0 ? (
            <span className="flex items-center gap-1.5 rounded bg-danger-soft px-2 py-1 text-[12.5px] font-medium text-danger">
              <ShieldAlert className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {criticosPendientes} requisito{criticosPendientes === 1 ? "" : "s"} NO
              subsanable{criticosPendientes === 1 ? "" : "s"} pendiente
              {criticosPendientes === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded bg-ok-soft px-2 py-1 text-[12.5px] font-medium text-ok">
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Sin críticos pendientes
            </span>
          )}

          {totales.total > 0 && (
            <span className="rounded bg-surface-2 px-2 py-1 font-mono text-[12.5px] text-ink">
              Oferta: {formatRD(totales.subtotal)} + ITBIS {formatRD(totales.itbis)} ={" "}
              <strong>{formatRD(totales.total)}</strong>
            </span>
          )}

          <button
            type="button"
            onClick={validar}
            disabled={validando}
            className={btnGhost("ml-auto !px-2.5 !py-1 !text-[12.5px]")}
          >
            <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {validando ? "Validando…" : "Validar expediente"}
          </button>
        </div>

        {(!tienePerfil || !tieneFirmantes) && (
          <p className="mt-2 flex items-center gap-1.5 rounded bg-warn-soft px-2 py-1.5 text-[12.5px] text-warn">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
            {!tienePerfil ? "Faltan los datos de la empresa" : "Faltan los firmantes"} —
            complétalos en{" "}
            <Link href="/configuracion/empresa" className="font-medium underline">
              Empresa
            </Link>
            .
          </p>
        )}

        {validacion === "ok" && (
          <p className="mt-2 flex items-center gap-1.5 rounded bg-ok-soft px-2 py-1.5 text-[12.5px] text-ok">
            <PackageOpen className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Expediente completo: el JSON canónico valida. Listo para el motor
            documental (Fase 4).
          </p>
        )}
        {Array.isArray(validacion) && (
          <div className="mt-2 rounded bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
            <p className="font-medium">Al expediente le falta:</p>
            <ul className="ml-4 list-disc">
              {validacion.map((e, i) => (
                <li key={i} className="font-mono text-[11.5px]">{e}</li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      {/* Ítems + Requisitos */}
      <div className="grid gap-4 xl:grid-cols-2">
        <ItemsPanel proceso={proceso} items={items} params={params} />
        <RequisitosPanel procesoId={proceso.id} requisitos={requisitos} />
      </div>
    </div>
  );
}
