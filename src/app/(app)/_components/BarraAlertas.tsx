"use client";

// La barra de estado de alertas: pegada arriba del todo, visible en
// CUALQUIER pantalla del sistema. Las alertas no son una opción de
// navegación — son el estado del negocio, así que viven en una barra de
// estado, no en el menú.
//
// Va en FLUJO NORMAL (sticky, no fixed): ocupa su propio alto, así que nadie
// tiene que reservarle hueco con paddings. Lo único que lee `--h-alertas`
// son los que se pegan al viewport y deben empezar justo debajo: el sidebar,
// la barra superior de móvil y su propio panel.
//
// El contador NO se apaga al abrirla: una alerta no se «marca como leída»,
// se resuelve subiendo el documento o cumpliendo el plazo. Aquí importa más
// que en una campanita, porque el número ES el contenido de la barra: si se
// apagara al mirarla, la barra diría «Todo al día» con un RPE vencido en la
// mano, a lo ancho de la pantalla y de forma permanente.
//
// Nada de backdrop-blur aquí: un backdrop-filter convertiría a la barra en
// el contenedor de su propio panel `fixed` (la trampa que ya pagamos con el
// drawer del menú). Fondo opaco, y el panel es HERMANO, no descendiente.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  ChevronDown,
  ClipboardList,
  Gavel,
  Package,
  X,
} from "lucide-react";
import {
  FUENTE_ALERTA_LABEL,
  NIVEL_ALERTA_LABEL,
  resumirAlertas,
  type Alerta,
  type FuenteAlerta,
  type NivelAlerta,
} from "@/lib/alertas";

const ICONO: Record<
  FuenteAlerta,
  React.ComponentType<{ className?: string; strokeWidth?: number }>
> = {
  documento: BadgeCheck,
  orden: Package,
  licitacion: Gavel,
  subsanacion: ClipboardList,
};

// Vencido y urgente comparten el rojo: la diferencia la lleva la PALABRA,
// no un quinto tono. El ámbar es solo para «por vencer».
const ESTILO_NIVEL: Record<
  NivelAlerta,
  { punto: string; chip: string; texto: string }
> = {
  vencido: { punto: "bg-danger", chip: "bg-danger-soft text-danger", texto: "text-danger" },
  urgente: { punto: "bg-danger", chip: "bg-danger-soft text-danger", texto: "text-danger" },
  aviso: { punto: "bg-warn", chip: "bg-warn-soft text-warn", texto: "text-warn" },
};

const ORDEN_NIVELES: NivelAlerta[] = ["vencido", "urgente", "aviso"];

// «1 vencido · 3 por vencer»: solo los grupos que existen de verdad.
const GRUPOS_RESUMEN = [
  { nivel: "vencido" as const, uno: "vencido", varios: "vencidos", color: "text-danger" },
  { nivel: "urgente" as const, uno: "urgente", varios: "urgentes", color: "text-danger" },
  { nivel: "aviso" as const, uno: "por vencer", varios: "por vencer", color: "text-warn" },
];

function piezasResumen(alertas: Alerta[]) {
  return GRUPOS_RESUMEN.map((g) => {
    const n = alertas.filter((a) => a.nivel === g.nivel).length;
    return { ...g, n, texto: `${n} ${n === 1 ? g.uno : g.varios}` };
  }).filter((g) => g.n > 0);
}

export default function BarraAlertas({ alertas }: { alertas: Alerta[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [movil, setMovil] = useState(false);
  const barraRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);

  const resumen = resumirAlertas(alertas);
  // ordenarAlertas() ya dejó arriba lo más grave y con menos tiempo.
  const primera = alertas[0] ?? null;
  const piezas = piezasResumen(alertas);

  const cerrar = useCallback(() => {
    setAbierto(false);
    barraRef.current?.focus();
  }, []);

  // ¿Modal o no? En móvil el panel tapa media pantalla y se comporta como
  // diálogo; en escritorio se sigue trabajando con él abierto.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const leer = () => setMovil(mq.matches);
    leer();
    mq.addEventListener("change", leer);
    return () => mq.removeEventListener("change", leer);
  }, []);

  // ⌘J / Ctrl+J abre y cierra el panel (⌘K ya es del buscador global).
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setAbierto((v) => !v);
      }
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, []);

  // Abierto: Escape cierra, un clic fuera cierra, y en móvil el fondo no
  // scrollea por debajo del panel.
  useEffect(() => {
    if (!abierto) return;
    tituloRef.current?.focus();
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    const alClicar = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || barraRef.current?.contains(t)) return;
      setAbierto(false);
    };
    document.addEventListener("keydown", alTeclear);
    document.addEventListener("mousedown", alClicar);
    const previo = document.body.style.overflow;
    if (movil) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.removeEventListener("mousedown", alClicar);
      document.body.style.overflow = previo;
    };
  }, [abierto, movil, cerrar]);

  function ir(href: string) {
    setAbierto(false);
    router.push(href);
  }

  const grupos = ORDEN_NIVELES.map((nivel) => ({
    nivel,
    items: alertas.filter((a) => a.nivel === nivel),
  })).filter((g) => g.items.length > 0);

  // El aria-label narra el estado ENTERO: lo visual son 12px con elipsis.
  const etiqueta =
    resumen.total === 0
      ? "Alertas: todo al día. Pulsa para ver qué se está vigilando."
      : `Alertas: ${piezas.map((p) => p.texto).join(", ")}. Lo más urgente: ${primera?.titulo}, ${primera?.detalle} Pulsa para ver el detalle.`;

  return (
    <>
      {/* ===== Panel desplegado — HERMANO de la barra, nunca hijo ===== */}
      {abierto && (
        <>
          {/* Móvil: velo que separa del contenido y absorbe el toque fuera.
              Empieza bajo la barra para que ella siga pulsable (es el toggle). */}
          <button
            type="button"
            aria-label="Cerrar las alertas"
            onClick={cerrar}
            className="fixed inset-x-0 bottom-0 top-[var(--h-alertas)] z-40 bg-black/25 md:hidden"
          />
          <div
            id="panel-alertas"
            ref={panelRef}
            role={movil ? "dialog" : "group"}
            aria-modal={movil ? true : undefined}
            aria-label="Alertas"
            className="fixed inset-x-0 top-[var(--h-alertas)] z-40 flex max-h-[min(70vh,520px)] flex-col border-b border-line-strong bg-surface shadow-raised animate-fade-in md:max-h-[min(56vh,420px)] print:hidden"
          >
            <div className="flex flex-none items-center gap-2 border-b border-line px-3 py-2">
              <h2
                ref={tituloRef}
                tabIndex={-1}
                className="text-[13px] font-semibold text-ink outline-none"
              >
                Alertas
              </h2>
              {piezas.map((p) => (
                <span key={p.nivel} className={`font-mono text-[11px] ${p.color}`}>
                  {p.texto}
                </span>
              ))}
              <button
                type="button"
                onClick={cerrar}
                aria-label="Cerrar"
                className="ml-auto rounded p-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
              {alertas.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <BadgeCheck className="mx-auto mb-2 h-7 w-7 text-ok" strokeWidth={1.8} aria-hidden />
                  <p className="text-[13px] font-medium text-ink">Todo al día</p>
                  {/* El vacío DICE qué se está vigilando: así «no hay alertas»
                      no se confunde con «esto dejó de funcionar». */}
                  <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-muted">
                    Se vigilan sin parar: los documentos de la empresa, los plazos de
                    entrega y cobro de las órdenes vivas, los cierres de licitación
                    pendientes de someter y las subsanaciones abiertas. Ahora mismo
                    ninguno pide atención.
                  </p>
                </div>
              ) : (
                grupos.map(({ nivel, items }) => (
                  <section key={nivel} className="mb-4 last:mb-0">
                    <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${ESTILO_NIVEL[nivel].punto}`}
                        aria-hidden
                      />
                      {NIVEL_ALERTA_LABEL[nivel]}
                      <span className="tracking-normal">({items.length})</span>
                    </p>
                    <ul className="grid gap-1.5 sm:grid-cols-2 2xl:grid-cols-3">
                      {items.map((a) => {
                        const Icono = ICONO[a.fuente];
                        return (
                          <li key={a.id}>
                            <button
                              type="button"
                              onClick={() => ir(a.href)}
                              className="flex h-full w-full items-start gap-2.5 rounded-md border border-line bg-surface px-2.5 py-2 text-left transition-colors hover:border-line-strong hover:bg-surface-2"
                            >
                              <span
                                className={`mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-md ${ESTILO_NIVEL[a.nivel].chip}`}
                              >
                                <Icono className="h-3.5 w-3.5" strokeWidth={2.2} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12.5px] font-medium text-ink">
                                  {a.titulo}
                                </span>
                                <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">
                                  {a.detalle}
                                </span>
                                <span className="mt-1 block font-mono text-[10px] uppercase tracking-wide text-muted/80">
                                  {FUENTE_ALERTA_LABEL[a.fuente]}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* ===== La barra (el 95% del tiempo, esto es todo lo que se ve) =====
          <section> y no <header>: el banner de la app ya es la barra
          superior de móvil, y dos landmarks `banner` se estorban. */}
      <section
        aria-label="Alertas"
        className="sticky top-0 z-40 border-b border-line bg-surface print:hidden"
      >
        <button
          ref={barraRef}
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          aria-controls="panel-alertas"
          aria-label={etiqueta}
          className="flex h-10 w-full items-center gap-2 px-3 text-left transition-colors hover:bg-surface-2 md:h-8"
        >
          {primera ? (
            <>
              <span
                className={`h-1.5 w-1.5 flex-none rounded-full ${ESTILO_NIVEL[primera.nivel].punto}`}
                aria-hidden
              />
              <span
                className={`flex-none font-mono text-[10px] font-medium uppercase tracking-[0.1em] ${ESTILO_NIVEL[primera.nivel].texto}`}
                aria-hidden
              >
                {NIVEL_ALERTA_LABEL[primera.nivel]}
              </span>
              <span className="max-w-[45%] flex-none truncate text-[12.5px] text-ink" aria-hidden>
                {primera.titulo}
              </span>
              <span className="hidden min-w-0 truncate text-[12px] text-muted sm:block" aria-hidden>
                {primera.detalle}
              </span>
            </>
          ) : (
            <>
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-ok" aria-hidden />
              <span className="min-w-0 truncate text-[12.5px] text-muted" aria-hidden>
                Todo al día
                <span className="hidden sm:inline">
                  {" "}
                  · sin plazos vencidos ni subsanaciones abiertas
                </span>
              </span>
            </>
          )}

          <span className="ml-auto flex flex-none items-center gap-2" aria-hidden>
            {/* Escritorio: el censo en palabras. */}
            <span className="hidden items-center gap-1.5 md:flex">
              {piezas.map((p, i) => (
                <span key={p.nivel} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-muted">·</span>}
                  <span className={`font-mono text-[11px] ${p.color}`}>{p.texto}</span>
                </span>
              ))}
            </span>
            {/* Móvil: no cabe el texto — solo el total, en chip. */}
            {resumen.total > 0 && (
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium md:hidden ${
                  resumen.grave ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"
                }`}
              >
                {resumen.total}
              </span>
            )}
            <ChevronDown
              className={`h-3.5 w-3.5 flex-none text-muted transition-transform ${abierto ? "rotate-180" : ""}`}
              strokeWidth={2}
            />
          </span>
        </button>
      </section>
    </>
  );
}
