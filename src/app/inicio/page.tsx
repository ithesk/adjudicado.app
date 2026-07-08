import type { Metadata } from "next";
import Link from "next/link";
import { LogoLockup } from "@/components/Logo";
import { urgenciaChip } from "@/lib/ui";
import Reveal from "./Reveal";

export const metadata: Metadata = {
  title: "adjudicado.app — de la orden de compra al cobro",
  description:
    "Registro único del trayecto post-adjudicación para empresas que ejecutan contratos del Estado dominicano. Plazos vigilados, documentos en su sitio y todo el equipo viendo lo mismo.",
};

const btnSolido = (pad = "px-5 py-2.5") =>
  `inline-flex items-center justify-center rounded-md bg-ink ${pad} text-sm font-medium text-canvas transition-[opacity,transform] hover:opacity-90 active:scale-[0.98]`;
const btnBorde =
  "inline-flex items-center justify-center rounded-md border border-line-strong bg-surface px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface-2";

export default function InicioPage() {
  return (
    <div className="bg-canvas text-ink">
      <Nav />
      <main>
        <Hero />
        <Problema />
        <Funciones />
        <ComoFunciona />
        <CierreCta />
      </main>
      <Pie />
    </div>
  );
}

/* ---------------------------------------------------------------- nav */

function Nav() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
        <Link href="/" aria-label="adjudicado.app">
          <LogoLockup markSize={24} textClass="text-base" />
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-md px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
          >
            Entrar
          </Link>
          <Link href="/registro" className={btnSolido("px-3.5 py-2")}>
            Crear cuenta
          </Link>
        </nav>
      </div>
    </header>
  );
}

/* --------------------------------------------------------------- hero */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(52rem 30rem at 70% -8rem, color-mix(in srgb, var(--primary) 6%, transparent), transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-5xl px-5 pt-20 pb-24 sm:pt-28">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-medium tracking-[0.05em] text-muted uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
            Licitaciones públicas · República Dominicana
          </p>
          <h1 className="font-display mt-6 text-4xl leading-[1.08] font-semibold tracking-[-0.03em] text-ink sm:text-5xl md:text-[3.4rem]">
            De la orden de compra al cobro, sin que nada se caiga.
          </h1>
          <p className="mt-6 max-w-xl text-[15px] leading-[1.65] text-ink-soft sm:text-base">
            Registro único del trayecto post-adjudicación para empresas que
            ejecutan contratos del Estado dominicano. Los plazos se vigilan
            solos, los documentos viven con su orden y todo el equipo ve lo
            mismo.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/registro" className={btnSolido()}>
              Crear la cuenta de tu empresa
            </Link>
            <Link href="/login" className={btnBorde}>
              Entrar
            </Link>
          </div>
          <p className="mt-4 text-[12px] text-muted">
            Sin tarjeta. Tu equipo entra por invitación de correo.
          </p>
        </div>

        <Reveal className="mt-16">
          <VentanaTriage />
        </Reveal>
      </div>
    </section>
  );
}

// Mini maqueta del triage real: ventana estilo escritorio con la bandeja
// ordenada por urgencia. Contenido ilustrativo, misma semántica de semáforo.
function VentanaTriage() {
  const filas = [
    {
      oc: "OC-2026-0148",
      inst: "Ministerio de Salud Pública",
      etapa: "Entrega",
      plazo: "Vence hoy",
      tono: "rojo" as const,
    },
    {
      oc: "OC-2026-0131",
      inst: "INABIE",
      etapa: "Subsanación",
      plazo: "3 días",
      tono: "ambar" as const,
    },
    {
      oc: "OC-2026-0117",
      inst: "Ayuntamiento del D. N.",
      etapa: "Facturación",
      plazo: "12 días",
      tono: "verde" as const,
    },
    {
      oc: "OC-2026-0092",
      inst: "MINERD",
      etapa: "Cobro",
      plazo: "Al día",
      tono: "verde" as const,
    },
  ];

  return (
    <figure className="mx-auto max-w-3xl">
      <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-raised">
        <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <i className="h-2.5 w-2.5 rounded-full bg-line-strong" />
            <i className="h-2.5 w-2.5 rounded-full bg-line-strong" />
            <i className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          </span>
          <span className="text-[12px] font-medium text-muted">
            Órdenes en seguimiento
          </span>
        </div>
        <ul className="divide-y divide-line text-[13px]">
          {filas.map((f) => (
            <li
              key={f.oc}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 px-4 py-3 sm:grid-cols-[8.5rem_1fr_7rem_auto]"
            >
              <span className="font-mono text-[12px] text-ink-soft">{f.oc}</span>
              <span className="truncate text-ink">{f.inst}</span>
              <span className="hidden text-muted sm:block">{f.etapa}</span>
              <span
                className={`justify-self-end rounded-full px-2.5 py-0.5 text-[11px] font-medium ${urgenciaChip(f.tono)}`}
              >
                {f.plazo}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="mt-3 text-center text-[12px] text-muted">
        La bandeja se ordena sola por urgencia. El rojo se reserva para plazos
        reales.
      </figcaption>
    </figure>
  );
}

/* ----------------------------------------------------------- problema */

function Problema() {
  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-5xl px-5 py-24 sm:py-28">
        <Reveal>
          <p className="text-[11px] font-medium tracking-[0.08em] text-muted uppercase">
            Por qué existe
          </p>
          <p className="font-display mt-5 max-w-3xl text-2xl leading-[1.35] font-medium tracking-[-0.015em] text-ink sm:text-[1.7rem]">
            Entre la adjudicación y el cobro pasan semanas. Los documentos se
            dispersan en correos, varias personas tocan la misma orden y una
            ventana de subsanación sin vigilar puede tumbar el contrato.{" "}
            <span className="text-muted">
              adjudicado.app existe para que el estado de una orden nunca
              dependa de la memoria de nadie.
            </span>
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- funciones */

const FUNCIONES = [
  {
    titulo: "Triage por urgencia",
    texto:
      "Una sola vista ordena el día. Las órdenes se acomodan por plazo y la que toca hoy salta sola; no hay que cazarla entre pestañas.",
    icono: IconoTriage,
    ancho: true,
  },
  {
    titulo: "Expediente completo",
    texto:
      "Bitácora, documentos, contactos y montos de cada orden en un solo lugar, con historial de quién hizo qué y cuándo.",
    icono: IconoExpediente,
    ancho: false,
  },
  {
    titulo: "Registro sin teclear",
    texto:
      "Pega la foto o el PDF de la orden de compra y el OCR extrae institución, ítems y montos por ti.",
    icono: IconoOcr,
    ancho: false,
  },
  {
    titulo: "Correo integrado",
    texto:
      "Reenvía un correo a la dirección de la orden y queda registrado en su bitácora, con los adjuntos incluidos.",
    icono: IconoCorreo,
    ancho: true,
  },
  {
    titulo: "Equipo al día",
    texto:
      "Invita a tu equipo por correo, con roles de administrador y colaborador, y grupos por área de trabajo.",
    icono: IconoEquipo,
    ancho: false,
  },
  {
    titulo: "Precios de suplidores",
    texto:
      "Busca en las listas de precios de tus suplidores para cotizar y responder subsanaciones más rápido.",
    icono: IconoPrecios,
    ancho: true,
  },
];

function Funciones() {
  return (
    <section className="border-t border-line bg-surface">
      <div className="mx-auto max-w-5xl px-5 py-24 sm:py-28">
        <Reveal>
          <p className="text-[11px] font-medium tracking-[0.08em] text-muted uppercase">
            Qué hace
          </p>
          <h2 className="font-display mt-4 max-w-xl text-3xl leading-[1.15] font-semibold tracking-[-0.02em] text-ink sm:text-4xl">
            Todo el trayecto de la orden, en una herramienta.
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FUNCIONES.map((f, i) => (
            <Reveal
              key={f.titulo}
              delay={(i % 3) * 80}
              className={f.ancho ? "lg:col-span-2" : ""}
            >
              <article className="h-full rounded-lg border border-line bg-canvas p-6 transition-shadow hover:shadow-card sm:p-8">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface text-ink-soft">
                  <f.icono />
                </span>
                <h3 className="font-display mt-4 text-[15px] font-semibold text-ink">
                  {f.titulo}
                </h3>
                <p className="mt-2 text-[13px] leading-[1.6] text-muted">
                  {f.texto}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------ cómo funciona */

const PASOS = [
  {
    n: "01",
    titulo: "Registra la orden",
    texto:
      "Pega la orden de compra adjudicada. El sistema la convierte en un expediente con institución, ítems, montos y fechas.",
  },
  {
    n: "02",
    titulo: "Da seguimiento en equipo",
    texto:
      "Etapas, plazos y bitácora compartida. El triage avisa qué toca hoy y nadie reconstruye el estado de memoria.",
  },
  {
    n: "03",
    titulo: "Cobra y cierra",
    texto:
      "Factura, vigila el pago y cierra la orden con todo el recorrido documentado, del primer correo al cobro.",
  },
];

function ComoFunciona() {
  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-5xl px-5 py-24 sm:py-28">
        <Reveal>
          <p className="text-[11px] font-medium tracking-[0.08em] text-muted uppercase">
            Cómo funciona
          </p>
          <h2 className="font-display mt-4 max-w-xl text-3xl leading-[1.15] font-semibold tracking-[-0.02em] text-ink sm:text-4xl">
            Tres pasos, ninguna orden perdida.
          </h2>
        </Reveal>
        <ol className="mt-12 grid gap-x-10 sm:grid-cols-3">
          {PASOS.map((p, i) => (
            <li key={p.n}>
              <Reveal
                delay={i * 80}
                className="border-t border-line-strong pt-5 pb-8"
              >
                <span className="font-mono text-[12px] text-primary">{p.n}</span>
                <h3 className="font-display mt-2 text-[15px] font-semibold text-ink">
                  {p.titulo}
                </h3>
                <p className="mt-2 text-[13px] leading-[1.6] text-muted">
                  {p.texto}
                </p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- cierre */

function CierreCta() {
  return (
    <section className="border-t border-line bg-surface">
      <div className="mx-auto max-w-5xl px-5 py-24 text-center sm:py-28">
        <Reveal>
          <h2 className="font-display mx-auto max-w-2xl text-3xl leading-[1.15] font-semibold tracking-[-0.02em] text-ink sm:text-4xl">
            Que ninguna orden se caiga por un plazo no vigilado.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[14px] leading-[1.6] text-muted">
            Crea el espacio de tu empresa en minutos e invita a tu equipo
            cuando quieras.
          </p>
          <Link href="/registro" className={`mt-8 ${btnSolido()}`}>
            Crear la cuenta de tu empresa
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

function Pie() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 px-5 py-10 sm:flex-row sm:items-center">
        <div>
          <LogoLockup markSize={22} textClass="text-sm" />
          <p className="mt-2 text-[12px] text-muted">
            Para empresas que ejecutan contratos del Estado dominicano.
          </p>
        </div>
        <nav className="flex gap-5 text-[13px] text-ink-soft">
          <Link href="/login" className="transition-colors hover:text-ink">
            Entrar
          </Link>
          <Link href="/registro" className="transition-colors hover:text-ink">
            Crear cuenta
          </Link>
        </nav>
      </div>
    </footer>
  );
}

/* -------------------------------------------------------------- iconos */
/* SVG propios, trazo 1.8 uniforme — sin librería de iconos en la landing. */

function baseIcono(children: React.ReactNode) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function IconoTriage() {
  return baseIcono(
    <>
      <path d="M4 6h12M4 12h16M4 18h9" />
      <circle cx="19.5" cy="6" r="2" fill="currentColor" stroke="none" />
    </>,
  );
}

function IconoExpediente() {
  return baseIcono(
    <>
      <path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
      <path d="M8 13h8M8 16h5" />
    </>,
  );
}

function IconoOcr() {
  return baseIcono(
    <>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </>,
  );
}

function IconoCorreo() {
  return baseIcono(
    <>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="m4 8 8 6 8-6" />
    </>,
  );
}

function IconoEquipo() {
  return baseIcono(
    <>
      <circle cx="9" cy="9" r="3" />
      <path d="M4 19c.6-3 2.4-4.5 5-4.5S13.4 16 14 19" />
      <circle cx="16.5" cy="10" r="2.4" />
      <path d="M16 14.7c2.2.2 3.5 1.6 4 4.3" />
    </>,
  );
}

function IconoPrecios() {
  return baseIcono(
    <>
      <path d="M4 10V5a1 1 0 0 1 1-1h5l9 9-6 6-9-9Z" />
      <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" stroke="none" />
    </>,
  );
}
