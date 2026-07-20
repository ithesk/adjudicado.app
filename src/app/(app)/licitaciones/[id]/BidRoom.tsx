"use client";

// La "Bid Room": la licitación como UNA SOLA PÁGINA. Arriba, la identidad y
// el recorrido del proceso; debajo, las secciones en orden de trabajo
// (Proceso → Requisitos → Ítems → Paquete) — nada de pestañas que obligan a
// ir y volver para comparar. Cada sección se pliega/expande (lo plegado
// sigue mostrando su estado y se recuerda entre visitas), y una barra fija
// acompaña el scroll con el estado vivo de cada una y salta a la que toque.

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Loader2,
  PackageOpen,
  ShieldAlert,
} from "lucide-react";
import { Hoja, Panel, btnGhost, btnPrimary } from "@/components/ui";
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

type Estacion = "proceso" | "requisitos" | "items" | "paquete" | "subsanacion";

const ORDEN: Estacion[] = ["proceso", "requisitos", "items", "paquete", "subsanacion"];

// A qué sección lleva cada estado de la línea de tiempo cuando se avanza.
function estacionDelEstado(estado: EstadoLicitacion): Estacion {
  if (estado === "captura") return "proceso";
  if (estado === "calificacion") return "requisitos";
  if (estado === "costeo") return "items";
  return "paquete";
}

const LS_COLAPSADAS = "bidroom-colapsadas";

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

// Cada sección se pliega/expande. Definido FUERA del padre (regla de la
// casa: un componente inline se remonta en cada render y pierde el foco).
function Seccion({
  id,
  titulo,
  hint,
  alerta,
  colapsada,
  onToggle,
  children,
}: {
  id: Estacion;
  titulo: string;
  hint: string;
  alerta?: boolean;
  colapsada: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 md:scroll-mt-14">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!colapsada}
        className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-2"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 flex-none text-muted transition-transform ${colapsada ? "-rotate-90" : ""}`}
          strokeWidth={2}
          aria-hidden
        />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          {titulo}
        </span>
        {hint && (
          <span
            className={`rounded px-1.5 font-mono text-[10.5px] ${
              alerta ? "bg-danger-soft font-semibold text-danger" : "bg-surface-2 text-muted"
            }`}
          >
            {hint}
          </span>
        )}
      </button>
      {!colapsada && <div className="mt-1.5">{children}</div>}
    </section>
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
}) {
  const router = useRouter();
  const { proceso, items, requisitos, institucion, subsanacion } = detalle;
  const [validacion, setValidacion] = useState<string[] | "ok" | null>(null);
  // Errores de la generación de la SUBSANACIÓN — se muestran en su sección.
  const [erroresSub, setErroresSub] = useState<string[] | null>(null);
  const [pasoTexto, setPasoTexto] = useState<string | null>(null);
  const [reusado, setReusado] = useState<"docx" | "pdf" | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [activa, setActiva] = useState<Estacion>("proceso");
  const [colapsadas, setColapsadas] = useState<Set<Estacion>>(new Set());

  // Lo plegado se recuerda entre visitas. Se lee después de montar para no
  // desajustar la hidratación (el servidor siempre pinta todo expandido);
  // ese doble render inicial es justamente lo que se quiere aquí.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_COLAPSADAS);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setColapsadas(new Set(JSON.parse(raw) as Estacion[]));
    } catch {
      // localStorage corrupto o bloqueado: se arranca todo expandido
    }
  }, []);

  function toggleSeccion(k: Estacion) {
    setColapsadas((prev) => {
      const s = new Set(prev);
      if (s.has(k)) s.delete(k);
      else s.add(k);
      try {
        localStorage.setItem(LS_COLAPSADAS, JSON.stringify([...s]));
      } catch {}
      return s;
    });
  }

  // Saltar a una sección la expande primero si estaba plegada.
  function irA(k: Estacion) {
    setColapsadas((prev) => {
      if (!prev.has(k)) return prev;
      const s = new Set(prev);
      s.delete(k);
      try {
        localStorage.setItem(LS_COLAPSADAS, JSON.stringify([...s]));
      } catch {}
      return s;
    });
    setTimeout(() => {
      document.getElementById(k)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }

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

  // La subsanación viva: qué pidieron y qué de eso aún no tiene archivo.
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
          `/api/licitaciones/${proceso.id}/generar?formato=${formato}${forzar ? "&regenerar=1" : ""}${subsanacionId ? `&subsanacion=${subsanacionId}` : ""}`,
        );
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          const lista = j?.faltantes ?? j?.criticos ?? [j?.error ?? "No se pudo generar."];
          // El detalle del error vive en la sección de donde salió el clic.
          if (subsanacionId) setErroresSub(lista);
          else setValidacion(lista);
          irA(subsanacionId ? "subsanacion" : "paquete");
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
    {
      key: "subsanacion",
      label: "Subsanación",
      hint: subsanacion
        ? subsanacion.estado === "enviada"
          ? "enviada"
          : textoDias(diasSub)
        : "",
      alerta: subsanacion?.estado === "abierta",
    },
  ];

  return (
    <Hoja ancho="ficha" className="space-y-4">
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

      {/* La barra que acompaña: anclas a la izquierda y LA ACCIÓN EVIDENTE a
          la derecha — generar el paquete nunca queda al fondo del scroll.
          Sticky — en móvil debajo del header de la app. */}
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

        <span className="ml-auto flex flex-wrap items-center gap-1.5 pl-1">
          {pasoTexto ? (
            <span className="flex items-center gap-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-ink-soft">
              <Loader2 className="h-3.5 w-3.5 flex-none animate-spin text-primary" strokeWidth={2} aria-hidden />
              <span className="max-w-56 truncate">{pasoTexto}</span>
            </span>
          ) : (
            <>
              {subsanacion?.estado === "abierta" && (
                <button
                  type="button"
                  onClick={() => irA("subsanacion")}
                  className={`flex items-center gap-1 rounded px-2 py-1 font-mono text-[11.5px] font-semibold ${urgenciaChip(nivelUrgencia(diasSub))}`}
                  title="La entidad pidió una subsanación — el reloj manda. Clic para verla."
                >
                  <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  subsana {textoDias(diasSub)}
                </button>
              )}
              {reusado && (
                <button
                  type="button"
                  onClick={() => irA("paquete")}
                  className="flex items-center gap-1 rounded bg-ok-soft px-2 py-1 text-[11.5px] font-medium text-ok"
                  title="Nada cambió: se descargó el paquete ya generado. Detalle en la sección Paquete."
                >
                  <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  sin cambios
                </button>
              )}
              {criticosBloqueantes > 0 ? (
                <button
                  type="button"
                  onClick={() => irA("requisitos")}
                  className="flex items-center gap-1 rounded bg-danger-soft px-2 py-1 text-[11.5px] font-medium text-danger"
                  title="Requisitos NO subsanables pendientes — resuélvelos para poder generar"
                >
                  <ShieldAlert className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  {criticosBloqueantes} crítico{criticosBloqueantes === 1 ? "" : "s"}
                </button>
              ) : (
                <span className="hidden items-center gap-1 rounded bg-ok-soft px-2 py-1 text-[11.5px] font-medium text-ok sm:flex">
                  <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  listo
                </span>
              )}
              <button
                type="button"
                onClick={() => generarPaquete(pdfListo ? "pdf" : "docx")}
                disabled={pendiente || criticosBloqueantes > 0}
                title={
                  criticosBloqueantes > 0
                    ? "Bloqueado: hay requisitos NO subsanables pendientes"
                    : pdfListo
                      ? "Arma el expediente completo por sobres EN PDF, listo para presentar"
                      : "Arma el expediente completo por sobres y descarga el ZIP"
                }
                className={btnPrimary("!px-3 !py-1.5 !text-[12.5px]")}
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
      </nav>

      <Seccion
        id="proceso"
        titulo={ESTACIONES[0].label}
        hint={ESTACIONES[0].hint}
        alerta={ESTACIONES[0].alerta}
        colapsada={colapsadas.has("proceso")}
        onToggle={() => toggleSeccion("proceso")}
      >
        <DatosProceso proceso={proceso} instituciones={instituciones} />
      </Seccion>

      <Seccion
        id="requisitos"
        titulo={ESTACIONES[1].label}
        hint={ESTACIONES[1].hint}
        alerta={ESTACIONES[1].alerta}
        colapsada={colapsadas.has("requisitos")}
        onToggle={() => toggleSeccion("requisitos")}
      >
        <RequisitosPanel
          procesoId={proceso.id}
          requisitos={requisitos}
          plantillasOrg={plantillasOrg}
          subsanacionId={subsanacion?.estado === "abierta" ? subsanacion.id : null}
        />
      </Seccion>

      <Seccion
        id="items"
        titulo={ESTACIONES[2].label}
        hint={ESTACIONES[2].hint}
        alerta={ESTACIONES[2].alerta}
        colapsada={colapsadas.has("items")}
        onToggle={() => toggleSeccion("items")}
      >
        <CotizadorItems proceso={proceso} items={items} params={params} />
      </Seccion>

      <Seccion
        id="paquete"
        titulo={ESTACIONES[3].label}
        hint={ESTACIONES[3].hint}
        alerta={ESTACIONES[3].alerta}
        colapsada={colapsadas.has("paquete")}
        onToggle={() => toggleSeccion("paquete")}
      >
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

          {/* La generación vive en la barra sticky de arriba (la acción
              evidente nunca al fondo); aquí queda el detalle. */}
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
          </div>

          {pasoTexto && (
            <div className="flex items-center gap-2 rounded bg-surface-2 px-3 py-2 text-[12.5px] text-ink-soft">
              <Loader2 className="h-4 w-4 flex-none animate-spin text-primary" strokeWidth={2} aria-hidden />
              <span className="font-medium">{pasoTexto}</span>
              <span className="text-muted">
                Puede tardar medio minuto — no cierres la página, el ZIP baja solo.
              </span>
            </div>
          )}

          {reusado && (
            <p className="flex flex-wrap items-center gap-1.5 rounded bg-ok-soft px-3 py-2 text-[12.5px] text-ok">
              <CheckCircle2 className="h-3.5 w-3.5 flex-none" strokeWidth={2} aria-hidden />
              Nada cambió desde la última generación: se descargó el mismo paquete al
              instante.
              <button
                type="button"
                onClick={() => generarPaquete(reusado, true)}
                className="font-medium underline"
                title="Vuelve a armarlo desde cero (por ejemplo, para refrescar la fecha de las cartas)"
              >
                Generar de nuevo de todos modos
              </button>
            </p>
          )}

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
      </Seccion>

      <Seccion
        id="subsanacion"
        titulo={ESTACIONES[4].label}
        hint={ESTACIONES[4].hint}
        alerta={ESTACIONES[4].alerta}
        colapsada={colapsadas.has("subsanacion")}
        onToggle={() => toggleSeccion("subsanacion")}
      >
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
      </Seccion>
    </Hoja>
  );
}
