"use client";

// La "Bid Room": la licitación como FICHA CON RIEL (mismo patrón que la
// orden y la entidad — docs/sistema-ui.md). A la izquierda el trabajo
// (Proceso → Requisitos → Ítems, y Subsanación cuando existe); a la
// derecha, SIEMPRE visible, el estado del expediente: el gate, el total,
// la validación y los paquetes ya generados. La acción evidente —
// generar — vive arriba, en la cabecera.

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Loader2,
  PackageOpen,
  ShieldAlert,
} from "lucide-react";
import {
  CabeceraPagina,
  DisposicionFicha,
  Hoja,
  Panel,
  btnGhost,
  btnPrimary,
} from "@/components/ui";
import { urlFirmada } from "@/lib/actions/storage";
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
import SubsanacionPanel from "./_components/SubsanacionPanel";

// A qué bloque se salta cuando se avanza en la línea de tiempo.
function seccionDelEstado(estado: EstadoLicitacion): string | null {
  if (estado === "captura") return "proceso";
  if (estado === "calificacion") return "requisitos";
  if (estado === "costeo") return "items";
  return null; // armado en adelante: el estado vive en el riel, ya visible
}

function irA(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Lo que se le cuenta al usuario mientras el paquete se arma (tarda unos
// segundos y sin señales la espera desespera). Los pasos avanzan con un
// reloj — el servidor no reporta progreso real, pero el orden es el real.
const PASOS_DOCX = [
  "Validando el expediente…",
  "Rellenando los formularios oficiales…",
  "Estampando firma y sello…",
  "Anexando lo subido y lo de Empresa…",
  "Armando los sobres y el índice…",
];
const PASOS_PDF = [
  "Validando el expediente…",
  "Rellenando los formularios oficiales…",
  "Estampando firma y sello…",
  "Convirtiendo cada documento a PDF…",
  "Anexando lo subido y lo de Empresa…",
  "Armando los sobres y el índice…",
];

export interface PaqueteGenerado {
  version: number;
  storage_path: string;
  generado_at: string;
}

// Descarga DIRECTA de un paquete ya generado (del respaldo en storage) —
// sin volver a generar nada. Definido FUERA del padre (regla de la casa).
function FilaPaquete({ p }: { p: PaqueteGenerado }) {
  const [bajando, setBajando] = useState(false);
  const nombre = p.storage_path.split("/").pop() ?? "paquete.zip";
  const esPdf = /_pdf(_unido)?\.zip$/.test(nombre);
  const esUnido = /_unido\.zip$/.test(nombre);
  return (
    <li className="flex items-center gap-2 py-1.5">
      <span className="font-mono text-[11.5px] text-muted">v{p.version}</span>
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${esPdf ? "bg-primary/10 text-primary" : "bg-surface-2 text-muted"}`}
      >
        {esUnido ? "PDF unido" : esPdf ? "PDF" : "Word"}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">
        {p.generado_at.slice(8, 10)}/{p.generado_at.slice(5, 7)} {p.generado_at.slice(11, 16)}
      </span>
      <button
        type="button"
        disabled={bajando}
        onClick={async () => {
          setBajando(true);
          try {
            const url = await urlFirmada("documentos", p.storage_path);
            if (url) {
              const a = document.createElement("a");
              a.href = url;
              a.download = nombre;
              a.click();
            }
          } finally {
            setBajando(false);
          }
        }}
        className="flex items-center gap-1 text-[12px] font-medium text-primary transition-colors hover:underline"
        title={`Baja ${nombre} tal cual se generó — no regenera nada`}
      >
        {bajando ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} aria-hidden />
        ) : (
          <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        )}
        Descargar
      </button>
    </li>
  );
}

export default function BidRoom({
  detalle,
  instituciones,
  plantillasOrg,
  params,
  tieneFirmantes,
  tienePerfil,
  pdfListo = false,
  paquetes = [],
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
  // Con el convertidor configurado, EL PDF ES LO PRINCIPAL — es lo que se
  // presenta; el Word queda como secundario editable.
  pdfListo?: boolean;
  // Lo ya generado, para descargar directo sin regenerar.
  paquetes?: PaqueteGenerado[];
}) {
  const router = useRouter();
  const { proceso, items, requisitos, institucion, subsanacion } = detalle;
  const [validacion, setValidacion] = useState<string[] | "ok" | null>(null);
  // Errores de la generación de la SUBSANACIÓN — se muestran en su sección.
  const [erroresSub, setErroresSub] = useState<string[] | null>(null);
  const [pasoTexto, setPasoTexto] = useState<string | null>(null);
  const [reusado, setReusado] = useState<"docx" | "pdf" | null>(null);
  // Un solo PDF por sobre (los portales piden subir 2-3 archivos, no 15).
  const [unir, setUnir] = useState(true);
  const [pendiente, startTransition] = useTransition();

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

  // La subsanación viva: qué pidieron y qué de eso aún no tiene archivo.
  const subAbierta = subsanacion?.estado === "abierta";
  const pedidos = subsanacion
    ? requisitos.filter((q) => q.subsanacion_id === subsanacion.id)
    : [];
  const pedidosBloqueantes = pedidos.filter(
    (q) =>
      q.estado === "pendiente" &&
      !CODIGOS_GENERABLES.includes(q.codigo) &&
      !codigosPlantillas.includes(q.codigo),
  ).length;
  const diasSub = subsanacion
    ? diasRestantes(subsanacion.fecha_limite.slice(0, 10))
    : null;
  // La sección Subsanación solo se monta cuando toca: hay una registrada, o
  // el proceso ya se sometió (y puede llegar el correo).
  const conSubsanacion =
    subsanacion !== null ||
    proceso.estado === "sometido" ||
    proceso.estado === "subsanacion";

  function generarPaquete(
    formato: "docx" | "pdf" = "docx",
    forzar = false,
    subsanacionId: string | null = null,
  ) {
    setValidacion(null);
    setErroresSub(null);
    setReusado(null);
    const pasos = formato === "pdf" ? PASOS_PDF : PASOS_DOCX;
    setPasoTexto(pasos[0]);
    let i = 0;
    const reloj = setInterval(() => {
      i = Math.min(i + 1, pasos.length - 1);
      setPasoTexto(pasos[i]);
    }, 2600);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/licitaciones/${proceso.id}/generar?formato=${formato}${formato === "pdf" && unir ? "&unir=1" : ""}${forzar ? "&regenerar=1" : ""}${subsanacionId ? `&subsanacion=${subsanacionId}` : ""}`,
        );
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          const lista = j?.faltantes ?? j?.criticos ?? [j?.error ?? "No se pudo generar."];
          // El detalle del error vive junto a donde salió el clic.
          if (subsanacionId) {
            setErroresSub(lista);
            irA("subsanacion");
          } else {
            setValidacion(lista);
          }
          return;
        }
        if (res.headers.get("X-Paquete-Reusado") === "1") setReusado(formato);
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
      } finally {
        clearInterval(reloj);
        setPasoTexto(null);
      }
    });
  }

  function cambiarEstado(estado: EstadoLicitacion) {
    startTransition(async () => {
      await actualizarProcesoAction(proceso.id, { estado });
      const destino = seccionDelEstado(estado);
      if (destino) irA(destino);
      router.refresh();
    });
  }

  function validar() {
    startTransition(async () => {
      const r = await validarCanonicoAction(proceso.id);
      setValidacion(r.errores ?? "ok");
    });
  }

  const fmtPrincipal: "docx" | "pdf" = pdfListo ? "pdf" : "docx";

  return (
    <Hoja ancho="ficha" className="space-y-4">
      <CabeceraPagina
        volver="/licitaciones"
        titulo={proceso.codigo}
        descripcion={[
          institucion?.nombre ?? "Sin entidad",
          MODALIDAD_LABEL[proceso.modalidad] ?? proceso.modalidad,
          proceso.objeto ?? null,
          proceso.cierre
            ? `cierra ${proceso.cierre.slice(8, 10)}/${proceso.cierre.slice(5, 7)} ${proceso.cierre.slice(11, 16)}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        acciones={
          <span className="flex flex-wrap items-center justify-end gap-1.5">
            <span className={`rounded px-2 py-1 font-mono text-[13px] font-semibold ${urgenciaChip(nivel)}`}>
              {textoDias(dias)}
            </span>
            {pasoTexto ? (
              <span className="flex items-center gap-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-ink-soft">
                <Loader2 className="h-3.5 w-3.5 flex-none animate-spin text-primary" strokeWidth={2} aria-hidden />
                <span className="max-w-56 truncate">{pasoTexto}</span>
              </span>
            ) : (
              <>
                {pdfListo && (
                  <label
                    className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-[11.5px] text-muted transition-colors hover:text-ink"
                    title="Une todos los PDF de cada sobre en UN solo archivo: subes Sobre_A.pdf y Sobre_B.pdf, no 15 archivos. Lo que no sea unible viaja suelto y el índice lo declara."
                  >
                    <input
                      type="checkbox"
                      checked={unir}
                      onChange={(e) => setUnir(e.target.checked)}
                    />
                    1 PDF por sobre
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => generarPaquete(fmtPrincipal)}
                  disabled={pendiente || criticosBloqueantes > 0}
                  title={
                    criticosBloqueantes > 0
                      ? "Bloqueado: hay requisitos NO subsanables pendientes"
                      : pdfListo
                        ? "Arma el expediente completo por sobres EN PDF, listo para presentar"
                        : "Arma el expediente completo por sobres y descarga el ZIP"
                  }
                  // Con una subsanación abierta, ESA es la acción del momento
                  // (vive en el riel); el paquete completo baja a secundario.
                  className={
                    subAbierta
                      ? btnGhost("!px-3 !py-1.5 !text-[12.5px]")
                      : btnPrimary("!px-3 !py-1.5 !text-[12.5px]")
                  }
                >
                  <PackageOpen className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  Generar paquete{pdfListo ? " PDF" : ""}
                </button>
                <button
                  type="button"
                  onClick={() => generarPaquete(pdfListo ? "docx" : "pdf")}
                  disabled={pendiente || criticosBloqueantes > 0}
                  title={
                    pdfListo
                      ? "Los mismos documentos en Word, por si hay que retocar algo a mano"
                      : "Los mismos documentos, convertidos a PDF"
                  }
                  className={btnGhost("!px-2.5 !py-1.5 !text-[12.5px]")}
                >
                  {pdfListo ? "Word" : "PDF"}
                </button>
              </>
            )}
          </span>
        }
      />

      <Panel className="p-4">
        <LineaTiempo
          estado={proceso.estado}
          pendiente={pendiente}
          onCambiar={cambiarEstado}
        />
      </Panel>

      <DisposicionFicha
        principal={
          <div className="space-y-4">
            <section id="proceso" className="scroll-mt-14">
              <DatosProceso proceso={proceso} instituciones={instituciones} />
            </section>

            <section id="requisitos" className="scroll-mt-14">
              <RequisitosPanel
                procesoId={proceso.id}
                requisitos={requisitos}
                plantillasOrg={plantillasOrg}
                subsanacionId={subAbierta && subsanacion ? subsanacion.id : null}
                pdfListo={pdfListo}
              />
            </section>

            <section id="items" className="scroll-mt-14">
              <CotizadorItems proceso={proceso} items={items} params={params} />
            </section>

            {conSubsanacion && (
              <section id="subsanacion" className="scroll-mt-14">
                <SubsanacionPanel
                  procesoId={proceso.id}
                  subsanacion={subsanacion}
                  pedidos={pedidos}
                  bloqueantes={pedidosBloqueantes}
                  generando={pendiente || pasoTexto !== null}
                  errores={erroresSub}
                  pdfListo={pdfListo}
                  onGenerar={(formato) =>
                    subsanacion && generarPaquete(formato, false, subsanacion.id)
                  }
                  onIrARequisitos={() => irA("requisitos")}
                />
              </section>
            )}
          </div>
        }
        riel={
          <div className="space-y-4">
            {/* ⏰ La subsanación abierta manda: su reloj y SU acción primaria. */}
            {subAbierta && subsanacion && (
              <Panel className="space-y-2 p-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                  Subsanación en curso
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-1 font-mono text-[12.5px] font-semibold ${urgenciaChip(nivelUrgencia(diasSub))}`}>
                    {textoDias(diasSub)}
                  </span>
                  <span className="text-[12px] text-muted">
                    vence {subsanacion.fecha_limite.slice(8, 10)}/{subsanacion.fecha_limite.slice(5, 7)}{" "}
                    {subsanacion.fecha_limite.slice(11, 16)}
                  </span>
                </div>
                {pedidos.length === 0 ? (
                  <p className="rounded bg-warn-soft px-2 py-1.5 text-[12px] text-warn">
                    Aún no marcaste qué pidieron —{" "}
                    <button type="button" onClick={() => irA("requisitos")} className="font-medium underline">
                      márcalo con «Subsanar»
                    </button>
                  </p>
                ) : (
                  <p className="text-[12px] text-ink-soft">
                    {pedidos.length} documento{pedidos.length === 1 ? "" : "s"} pedido
                    {pedidos.length === 1 ? "" : "s"}
                    {pedidosBloqueantes > 0 && (
                      <span className="font-medium text-danger"> · {pedidosBloqueantes} sin archivo</span>
                    )}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => generarPaquete(fmtPrincipal, false, subsanacion.id)}
                  disabled={pendiente || pasoTexto !== null || pedidos.length === 0 || pedidosBloqueantes > 0}
                  className={btnPrimary("w-full !py-1.5 !text-[12.5px]")}
                >
                  <PackageOpen className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  Generar subsanación{pdfListo ? " PDF" : ""}
                </button>
                <button
                  type="button"
                  onClick={() => irA("subsanacion")}
                  className="text-[12px] font-medium text-primary hover:underline"
                >
                  Ver el detalle y el correo
                </button>
              </Panel>
            )}

            {/* El expediente, siempre a la vista: gate, total, validación
                y lo ya generado. */}
            <Panel className="space-y-2.5 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                Expediente
              </p>

              {criticosPendientes > 0 ? (
                <button
                  type="button"
                  onClick={() => irA("requisitos")}
                  className="flex w-full items-center gap-1.5 rounded bg-danger-soft px-2 py-1.5 text-left text-[12.5px] font-medium text-danger"
                  title="Resuélvelos en Requisitos — el paquete no puede salir así"
                >
                  <ShieldAlert className="h-3.5 w-3.5 flex-none" strokeWidth={2} aria-hidden />
                  {criticosPendientes} NO subsanable{criticosPendientes === 1 ? "" : "s"} pendiente
                  {criticosPendientes === 1 ? "" : "s"}
                </button>
              ) : (
                <p className="flex items-center gap-1.5 rounded bg-ok-soft px-2 py-1.5 text-[12.5px] font-medium text-ok">
                  <CheckCircle2 className="h-3.5 w-3.5 flex-none" strokeWidth={2} aria-hidden />
                  Sin críticos pendientes
                </p>
              )}

              {sinCotizar > 0 && (
                <button
                  type="button"
                  onClick={() => irA("items")}
                  className="flex w-full items-center gap-1.5 rounded bg-warn-soft px-2 py-1.5 text-left text-[12px] font-medium text-warn"
                >
                  <AlertTriangle className="h-3.5 w-3.5 flex-none" strokeWidth={2} aria-hidden />
                  {sinCotizar} ítem{sinCotizar === 1 ? "" : "s"} sin cotizar
                </button>
              )}

              {totales.total > 0 && (
                <table className="w-full font-mono text-[12px]">
                  <tbody>
                    <tr>
                      <td className="py-0.5 text-muted">Subtotal</td>
                      <td className="text-right text-ink">{formatRD(totales.subtotal)}</td>
                    </tr>
                    <tr>
                      <td className="py-0.5 text-muted">ITBIS ({params.itbisPct}%)</td>
                      <td className="text-right text-ink">{formatRD(totales.itbis)}</td>
                    </tr>
                    <tr className="text-[13px] font-semibold">
                      <td className="pt-1 text-ink">Total oferta</td>
                      <td className="pt-1 text-right text-ink">{formatRD(totales.total)}</td>
                    </tr>
                  </tbody>
                </table>
              )}

              <button
                type="button"
                onClick={validar}
                disabled={pendiente}
                className={btnGhost("w-full !py-1.5 !text-[12.5px]")}
              >
                <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                {pendiente ? "Validando…" : "Validar expediente"}
              </button>

              {validacion === "ok" && (
                <p className="flex items-center gap-1.5 rounded bg-ok-soft px-2 py-1.5 text-[12px] text-ok">
                  <CheckCircle2 className="h-3.5 w-3.5 flex-none" strokeWidth={2} aria-hidden />
                  Expediente completo — listo para generar.
                </p>
              )}
              {Array.isArray(validacion) && (
                <div className="rounded bg-danger-soft px-2.5 py-2 text-[12px] text-danger">
                  <p className="font-medium">Al expediente le falta:</p>
                  <ul className="ml-4 list-disc">
                    {validacion.map((e, i) => (
                      <li key={i} className="font-mono text-[11px]">{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {reusado && (
                <p className="rounded bg-ok-soft px-2.5 py-1.5 text-[12px] text-ok">
                  Nada cambió: se descargó el paquete ya generado al instante.{" "}
                  <button
                    type="button"
                    onClick={() => generarPaquete(reusado, true)}
                    className="font-medium underline"
                    title="Vuelve a armarlo desde cero (por ejemplo, para refrescar la fecha de las cartas)"
                  >
                    Generar de nuevo
                  </button>
                </p>
              )}

              {paquetes.length > 0 && (
                <div>
                  <p className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                    Generados — descarga directa
                  </p>
                  <ul className="max-h-56 divide-y divide-line overflow-y-auto">
                    {paquetes.map((p) => (
                      <FilaPaquete key={p.version} p={p} />
                    ))}
                  </ul>
                </div>
              )}
            </Panel>

            {(!tienePerfil || !tieneFirmantes) && (
              <Panel className="p-3">
                <p className="flex items-start gap-1.5 text-[12px] text-warn">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                  <span>
                    {!tienePerfil ? "Faltan los datos de la empresa" : "Faltan los firmantes"} —
                    complétalos en{" "}
                    <Link href="/configuracion/empresa" className="font-medium underline">
                      Configuración → Empresa
                    </Link>{" "}
                    para poder generar.
                  </span>
                </p>
              </Panel>
            )}
          </div>
        }
      />
    </Hoja>
  );
}
