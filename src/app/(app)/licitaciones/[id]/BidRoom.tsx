"use client";

// La "Bid Room": la licitación como UNA SOLA PÁGINA. Arriba, la identidad y
// el recorrido del proceso; debajo, TODO visible en orden de trabajo
// (Proceso → Requisitos → Ítems → Paquete) — nada de pestañas que obligan a
// ir y volver para comparar. Una barra fija acompaña el scroll con el estado
// vivo de cada sección y salta a la que toque.

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
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
import { CODIGOS_GENERABLES } from "@/lib/licitaciones/requisitos-estandar";
import { totalesProceso, type ParamsCotizacion } from "@/lib/licitaciones/cotizador";
import {
  actualizarProcesoAction,
  validarCanonicoAction,
} from "@/lib/actions/licitaciones";
import LineaTiempo from "./_components/LineaTiempo";
import DatosProceso from "./_components/DatosProceso";
import CotizadorItems from "./_components/CotizadorItems";
import RequisitosPanel from "./_components/RequisitosPanel";

type Estacion = "proceso" | "requisitos" | "items" | "paquete";

const ORDEN: Estacion[] = ["proceso", "requisitos", "items", "paquete"];

// A qué sección lleva cada estado de la línea de tiempo cuando se avanza.
function estacionDelEstado(estado: EstadoLicitacion): Estacion {
  if (estado === "captura") return "proceso";
  if (estado === "calificacion") return "requisitos";
  if (estado === "costeo") return "items";
  return "paquete";
}

function irA(estacion: Estacion) {
  document
    .getElementById(estacion)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function BidRoom({
  detalle,
  instituciones,
  plantillasOrg,
  params,
  tieneFirmantes,
  tienePerfil,
}: {
  detalle: ProcesoDetalle;
  instituciones: { id: string; nombre: string }[];
  plantillasOrg: {
    codigo: string;
    nombre: string;
    preguntas: { clave: string; etiqueta: string }[];
  }[];
  params: ParamsCotizacion;
  tieneFirmantes: boolean;
  tienePerfil: boolean;
}) {
  const router = useRouter();
  const { proceso, items, requisitos, institucion } = detalle;
  const [validacion, setValidacion] = useState<string[] | "ok" | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [activa, setActiva] = useState<Estacion>("proceso");

  // Scroll-spy: la barra resalta la sección que está en pantalla.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActiva(e.target.id as Estacion);
        }
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    for (const k of ORDEN) {
      const el = document.getElementById(k);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const dias = diasRestantes(proceso.cierre ? proceso.cierre.slice(0, 10) : null);
  const nivel = nivelUrgencia(dias);
  const criticosPendientes = noSubsanablesPendientes(requisitos);
  // El gate del paquete no cuenta los que la propia generación produce —
  // incluidas las plantillas construidas por la organización.
  const codigosPlantillas = plantillasOrg.map((p) => p.codigo);
  const criticosBloqueantes = requisitos.filter(
    (q) =>
      !q.subsanable &&
      q.estado === "pendiente" &&
      !CODIGOS_GENERABLES.includes(q.codigo) &&
      !codigosPlantillas.includes(q.codigo),
  ).length;
  const totales = totalesProceso(items, params.itbisPct);
  const sinCotizar = items.filter(
    (i) => i.ofertamos && i.precio_unitario === null,
  ).length;

  function generarPaquete(formato: "docx" | "pdf" = "docx") {
    setValidacion(null);
    startTransition(async () => {
      const res = await fetch(
        `/api/licitaciones/${proceso.id}/generar?formato=${formato}`,
      );
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setValidacion(j?.faltantes ?? j?.criticos ?? [j?.error ?? "No se pudo generar."]);
        return;
      }
      const blob = await res.blob();
      const nombre =
        res.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1] ??
        "paquete.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(url);
      router.refresh(); // los requisitos generados quedaron listos
    });
  }

  function cambiarEstado(estado: EstadoLicitacion) {
    startTransition(async () => {
      await actualizarProcesoAction(proceso.id, { estado });
      irA(estacionDelEstado(estado));
      router.refresh();
    });
  }

  function validar() {
    startTransition(async () => {
      const r = await validarCanonicoAction(proceso.id);
      setValidacion(r.errores ?? "ok");
    });
  }

  // El estado vivo de cada sección, siempre a la vista en la barra.
  const ESTACIONES: {
    key: Estacion;
    label: string;
    hint: string;
    alerta?: boolean;
  }[] = [
    { key: "proceso", label: "Proceso", hint: institucion?.siglas ?? institucion?.nombre?.split(" ")[0] ?? "sin entidad" },
    {
      key: "requisitos",
      label: "Requisitos",
      hint: criticosPendientes > 0 ? `${criticosPendientes} críticos` : `${requisitos.length} ✓`,
      alerta: criticosPendientes > 0,
    },
    {
      key: "items",
      label: "Ítems",
      hint: sinCotizar > 0 ? `${sinCotizar} sin cotizar` : totales.total > 0 ? formatRD(totales.total) : `${items.length}`,
      alerta: sinCotizar > 0,
    },
    {
      key: "paquete",
      label: "Paquete",
      hint: criticosBloqueantes > 0 ? "bloqueado" : "listo",
      alerta: criticosBloqueantes > 0,
    },
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
              // Formato manual desde el texto guardado: sin new Date() no hay
              // desajuste de hidratación ni corrimiento de zona horaria — la
              // hora del pliego es la hora que se ve.
              <p className="mt-1 text-[11px] text-muted">
                Cierre: {proceso.cierre.slice(8, 10)}/{proceso.cierre.slice(5, 7)}{" "}
                {proceso.cierre.slice(11, 16)}
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

      {/* La barra que acompaña: salta a cada sección y muestra su estado
          vivo. Sticky — en móvil debajo del header de la app. */}
      <nav className="sticky top-12 z-20 -mx-1 flex flex-wrap items-center gap-1 rounded-lg border border-line bg-canvas/95 px-1 py-1 backdrop-blur md:top-2">
        {ESTACIONES.map((e) => (
          <button
            key={e.key}
            type="button"
            onClick={() => irA(e.key)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
              activa === e.key
                ? "bg-surface-2 text-ink"
                : "text-muted hover:text-ink"
            }`}
          >
            {e.label}
            {e.hint && (
              <span
                className={`rounded px-1 font-mono text-[10.5px] font-normal ${
                  e.alerta ? "bg-danger-soft text-danger" : "text-muted"
                }`}
              >
                {e.hint}
              </span>
            )}
          </button>
        ))}
      </nav>

      <section id="proceso" className="scroll-mt-24 md:scroll-mt-14">
        <DatosProceso proceso={proceso} instituciones={instituciones} />
      </section>

      <section id="requisitos" className="scroll-mt-24 md:scroll-mt-14">
        <RequisitosPanel
          procesoId={proceso.id}
          requisitos={requisitos}
          plantillasOrg={plantillasOrg}
        />
      </section>

      <section id="items" className="scroll-mt-24 md:scroll-mt-14">
        <CotizadorItems proceso={proceso} items={items} params={params} />
      </section>

      <section id="paquete" className="scroll-mt-24 md:scroll-mt-14">
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
              onClick={() => generarPaquete("docx")}
              disabled={pendiente || criticosBloqueantes > 0}
              title={
                criticosBloqueantes > 0
                  ? "Bloqueado: hay requisitos NO subsanables pendientes (los formularios que este botón genera no cuentan)"
                  : "Rellena los formularios oficiales (F.033/034/042) con el expediente y descarga el ZIP"
              }
              className={btnPrimary(criticosBloqueantes > 0 ? "opacity-50" : "")}
            >
              <PackageOpen className="h-4 w-4" strokeWidth={2} aria-hidden />
              {pendiente ? "Generando…" : "Generar paquete (Word)"}
            </button>
            <button
              type="button"
              onClick={() => generarPaquete("pdf")}
              disabled={pendiente || criticosBloqueantes > 0}
              title="Los mismos documentos, convertidos a PDF en el servidor de la empresa"
              className={btnGhost(criticosBloqueantes > 0 ? "opacity-50" : "")}
            >
              <PackageOpen className="h-4 w-4" strokeWidth={2} aria-hidden />
              PDF
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
      </section>
    </div>
  );
}
