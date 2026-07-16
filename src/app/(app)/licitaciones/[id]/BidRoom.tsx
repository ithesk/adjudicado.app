"use client";

// La "Bid Room": la licitación como LÍNEA DE TIEMPO. Arriba, el recorrido
// del proceso (captura → … → sometido → resultado); abajo, las estaciones:
// 1 Proceso (los datos) → 2 Pliego (qué piden) → 3 Cotización (nuestra
// oferta) → 4 Paquete (el gate y la validación del expediente).

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
import { Panel, btnGhost, btnPrimary } from "@/components/ui";
import { diasRestantes, formatRD, nivelUrgencia } from "@/lib/types";
import { urgenciaChip, textoDias } from "@/lib/ui";
import {
  MODALIDAD_LABEL,
  noSubsanablesPendientes,
  type EstadoLicitacion,
  type ProcesoDetalle,
} from "@/lib/licitaciones/tipos";
import { totalesProceso, type ParamsCotizacion } from "@/lib/licitaciones/cotizador";
import {
  actualizarProcesoAction,
  validarCanonicoAction,
} from "@/lib/actions/licitaciones";
import LineaTiempo from "./_components/LineaTiempo";
import DatosProceso from "./_components/DatosProceso";
import ItemsPliego from "./_components/ItemsPliego";
import CotizacionPanel from "./_components/CotizacionPanel";
import RequisitosPanel from "./_components/RequisitosPanel";

type Estacion = "proceso" | "pliego" | "cotizacion" | "paquete";

// En qué estación te deja cada estado de la línea de tiempo.
function estacionInicial(estado: EstadoLicitacion): Estacion {
  if (estado === "captura") return "proceso";
  if (estado === "calificacion") return "pliego";
  if (estado === "costeo") return "cotizacion";
  return "paquete";
}

export default function BidRoom({
  detalle,
  instituciones,
  params,
  tieneFirmantes,
  tienePerfil,
}: {
  detalle: ProcesoDetalle;
  instituciones: { id: string; nombre: string }[];
  params: ParamsCotizacion;
  tieneFirmantes: boolean;
  tienePerfil: boolean;
}) {
  const router = useRouter();
  const { proceso, items, requisitos, institucion } = detalle;
  const [validacion, setValidacion] = useState<string[] | "ok" | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [estacion, setEstacion] = useState<Estacion>(() =>
    estacionInicial(proceso.estado),
  );

  const dias = diasRestantes(proceso.cierre ? proceso.cierre.slice(0, 10) : null);
  const nivel = nivelUrgencia(dias);
  const criticosPendientes = noSubsanablesPendientes(requisitos);
  const totales = totalesProceso(items, params.itbisPct);
  const sinCotizar = items.filter(
    (i) => i.ofertamos && i.precio_unitario === null,
  ).length;

  function cambiarEstado(estado: EstadoLicitacion) {
    startTransition(async () => {
      await actualizarProcesoAction(proceso.id, { estado });
      setEstacion(estacionInicial(estado));
      router.refresh();
    });
  }

  function validar() {
    startTransition(async () => {
      const r = await validarCanonicoAction(proceso.id);
      setValidacion(r.errores ?? "ok");
    });
  }

  const ESTACIONES: { key: Estacion; label: string; hint: string }[] = [
    { key: "proceso", label: "1 · Proceso", hint: institucion?.nombre ?? "sin entidad" },
    { key: "pliego", label: "2 · Pliego", hint: `${items.length} ítems · ${requisitos.length} req.` },
    { key: "cotizacion", label: "3 · Cotización", hint: sinCotizar > 0 ? `${sinCotizar} sin cotizar` : totales.total > 0 ? formatRD(totales.total) : "" },
    { key: "paquete", label: "4 · Paquete", hint: criticosPendientes > 0 ? `${criticosPendientes} críticos` : "" },
  ];

  return (
    <div className="space-y-4">
      {/* Cabecera: identidad + reloj + la línea de tiempo */}
      <Panel className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold text-ink">{proceso.codigo}</p>
            <p className="text-[13px] text-muted">
              {institucion?.nombre ?? "Sin entidad"} ·{" "}
              {MODALIDAD_LABEL[proceso.modalidad] ?? proceso.modalidad}
              {proceso.objeto ? ` · ${proceso.objeto}` : ""}
            </p>
          </div>
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
        </div>

        <LineaTiempo
          estado={proceso.estado}
          pendiente={pendiente}
          onCambiar={cambiarEstado}
        />

        {(!tienePerfil || !tieneFirmantes) && (
          <p className="flex items-center gap-1.5 rounded bg-warn-soft px-2 py-1.5 text-[12.5px] text-warn">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
            {!tienePerfil ? "Faltan los datos de la empresa" : "Faltan los firmantes"} —
            complétalos en{" "}
            <Link href="/configuracion/empresa" className="font-medium underline">
              Configuración → Empresa
            </Link>
            .
          </p>
        )}
      </Panel>

      {/* Las estaciones de la línea */}
      <div className="flex flex-wrap gap-1 border-b border-line">
        {ESTACIONES.map((e) => (
          <button
            key={e.key}
            type="button"
            onClick={() => setEstacion(e.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-left text-[13px] font-medium transition-colors ${
              estacion === e.key
                ? "border-primary text-ink"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {e.label}
            {e.hint && (
              <span className="ml-2 hidden font-mono text-[11px] font-normal text-muted sm:inline">
                {e.hint}
              </span>
            )}
          </button>
        ))}
      </div>

      {estacion === "proceso" && (
        <DatosProceso proceso={proceso} instituciones={instituciones} />
      )}

      {estacion === "pliego" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <ItemsPliego proceso={proceso} items={items} />
          <RequisitosPanel procesoId={proceso.id} requisitos={requisitos} />
        </div>
      )}

      {estacion === "cotizacion" && <CotizacionPanel items={items} params={params} />}

      {estacion === "paquete" && (
        <Panel className="space-y-3 p-4">
          {/* El gate: los no-subsanables mandan. */}
          <div className="flex flex-wrap items-center gap-2">
            {criticosPendientes > 0 ? (
              <span className="flex items-center gap-1.5 rounded bg-danger-soft px-2 py-1 text-[12.5px] font-medium text-danger">
                <ShieldAlert className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                {criticosPendientes} requisito{criticosPendientes === 1 ? "" : "s"} NO
                subsanable{criticosPendientes === 1 ? "" : "s"} pendiente
                {criticosPendientes === 1 ? "" : "s"} — el paquete no puede salir así
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
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={validar}
              disabled={pendiente}
              className={btnGhost()}
            >
              <ClipboardCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
              {pendiente ? "Validando…" : "Validar expediente"}
            </button>
            <button
              type="button"
              disabled
              title="Fase 4: rellenar los formularios oficiales, convertir a PDF, firmar y empaquetar"
              className={btnPrimary("opacity-50")}
            >
              <PackageOpen className="h-4 w-4" strokeWidth={2} aria-hidden />
              Generar paquete (próximamente)
            </button>
          </div>

          {validacion === "ok" && (
            <p className="flex items-center gap-1.5 rounded bg-ok-soft px-2 py-1.5 text-[12.5px] text-ok">
              <PackageOpen className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Expediente completo: el JSON canónico valida. Listo para el motor
              documental (Fase 4).
            </p>
          )}
          {Array.isArray(validacion) && (
            <div className="rounded bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
              <p className="font-medium">Al expediente le falta:</p>
              <ul className="ml-4 list-disc">
                {validacion.map((e, i) => (
                  <li key={i} className="font-mono text-[11.5px]">{e}</li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
