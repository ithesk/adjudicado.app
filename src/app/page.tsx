import Link from "next/link";
import type { Metadata } from "next";
import {
  FileText,
  LayoutList,
  Clock,
  MessageSquare,
  FolderClosed,
  Tags,
  ArrowRight,
  Check,
  ShieldCheck,
} from "lucide-react";
import { LogoLockup, LogoMarca } from "@/components/Logo";
import { PLANES, precioLegible, DIAS_PRUEBA } from "@/lib/planes";

export const metadata: Metadata = {
  title: "adjudicado.app — de la orden de compra al cobro",
  description:
    "Registro único del trayecto post-adjudicación para empresas que ejecutan contratos del Estado dominicano (DGCP / ComprasDominicana). Plazos vigilados, documentos en su sitio, el equipo al día.",
};

const CONTACTO = "ventas@adjudicado.app";

const FEATURES = [
  {
    icon: FileText,
    titulo: "La OC se lee sola",
    texto:
      "Sube el PDF de la orden de compra y la IA extrae institución, ítems y montos. Confirmas y listo — sin teclear dos veces.",
  },
  {
    icon: LayoutList,
    titulo: "Triage por urgencia",
    texto:
      "Una sola pantalla ordena el día: las órdenes se acomodan solas por plazo. La urgente no hay que cazarla.",
  },
  {
    icon: Clock,
    titulo: "Dos relojes por orden",
    texto:
      "El de la institución (entrega) y el del suplidor (llegada). Ves de un vistazo quién te va a hacer perder el plazo.",
  },
  {
    icon: MessageSquare,
    titulo: "Bitácora del equipo",
    texto:
      "Notas, correos, llamadas y avances del suplidor en un solo hilo. Nadie reconstruye el estado de memoria.",
  },
  {
    icon: FolderClosed,
    titulo: "Documentos en su sitio",
    texto:
      "OC, facturas y requisitos adjuntos a cada orden, con acceso privado. Cuando toca facturar, está todo.",
  },
  {
    icon: Tags,
    titulo: "Precios de suplidores",
    texto:
      "Busca en las listas de precios de tus suplidores para cotizar rápido y no dejar margen sobre la mesa.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <Problema />
        <Features />
        <Planes />
        <CtaFinal />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" aria-label="adjudicado.app — inicio">
          <LogoLockup markSize={24} textClass="text-[15px]" />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <a
            href="#producto"
            className="hidden rounded-md px-3 py-1.5 text-[13.5px] text-ink-soft transition-colors hover:text-ink sm:inline-block"
          >
            Producto
          </a>
          <a
            href="#planes"
            className="hidden rounded-md px-3 py-1.5 text-[13.5px] text-ink-soft transition-colors hover:text-ink sm:inline-block"
          >
            Planes
          </a>
          <Link
            href="/login"
            className="rounded-md px-3 py-1.5 text-[13.5px] font-medium text-ink-soft transition-colors hover:text-ink"
          >
            Entrar
          </Link>
          <Link
            href="/registro"
            className="rounded-md bg-primary px-3.5 py-1.5 text-[13.5px] font-semibold text-primary-ink shadow-card transition-colors hover:bg-primary-hover"
          >
            Crear cuenta
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-6 pt-16 sm:px-6 sm:pt-24">
      <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" strokeWidth={2} aria-hidden />
            DGCP · ComprasDominicana
          </p>
          <h1 className="font-display text-[2.1rem] font-semibold leading-[1.08] tracking-tight text-ink sm:text-[2.9rem]">
            De la orden de compra al cobro, sin que se te caiga ni una.
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-soft">
            El registro único del trayecto post-adjudicación para empresas que
            ejecutan contratos del Estado dominicano. Plazos vigilados,
            documentos en su sitio y el equipo al día — sin reconstruir nada de
            memoria.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/registro"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-ink shadow-card transition-colors hover:bg-primary-hover"
            >
              Crear cuenta gratis
              <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            </Link>
            <a
              href="#planes"
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-5 py-2.5 text-sm font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
            >
              Ver planes
            </a>
          </div>
          <p className="mt-3 font-mono text-[11.5px] text-muted">
            {DIAS_PRUEBA} días de prueba · sin tarjeta para empezar
          </p>
        </div>

        <PanelMock />
      </div>
    </section>
  );
}

// Mock estático del tablero — refuerza el "panel de control" sin capturas.
function PanelMock() {
  const filas = [
    { oc: "OC-2026-0148", inst: "Ministerio de Salud", plazo: "Hoy", tono: "danger" as const },
    { oc: "OC-2026-0151", inst: "INAPA", plazo: "2 días", tono: "warn" as const },
    { oc: "OC-2026-0139", inst: "Ayuntamiento DN", plazo: "6 días", tono: "muted" as const },
    { oc: "OC-2026-0134", inst: "OGTIC", plazo: "En cobro", tono: "ok" as const },
  ];
  const tono = {
    danger: "bg-danger-soft text-danger",
    warn: "bg-warn-soft text-warn",
    ok: "bg-ok-soft text-ok",
    muted: "bg-surface-2 text-muted",
  };
  return (
    <div className="rounded-xl border border-line bg-surface p-3 shadow-raised">
      <div className="flex items-center gap-2 border-b border-line px-1.5 pb-2.5">
        <LogoMarca size={16} className="text-ink" />
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted">
          Órdenes vivas
        </span>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-muted">
          4
        </span>
      </div>
      <ul className="divide-y divide-line">
        {filas.map((f) => (
          <li key={f.oc} className="flex items-center gap-3 px-1.5 py-2.5">
            <div className="min-w-0">
              <p className="font-mono text-[12px] tabular-nums text-ink">{f.oc}</p>
              <p className="truncate text-[12px] text-muted">{f.inst}</p>
            </div>
            <span
              className={`ml-auto rounded-full px-2 py-0.5 font-mono text-[11px] font-medium ${tono[f.tono]}`}
            >
              {f.plazo}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Problema() {
  return (
    <section id="producto" className="border-y border-line bg-surface/40">
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          El problema
        </p>
        <p className="font-display text-xl font-medium leading-snug text-ink sm:text-2xl">
          Entre que se adjudica y se cobra pasan semanas. Los documentos se
          pierden, varias personas tocan la misma orden y se pierde la
          continuidad.{" "}
          <span className="text-muted">
            Una ventana de subsanación sin vigilar y se cae la licitación.
          </span>
        </p>
        <p className="mt-6 text-[15px] text-ink-soft">
          adjudicado.app es el sitio donde nada de eso vuelve a pasar: ninguna
          orden se cae por un plazo no vigilado.
        </p>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="mb-10 max-w-2xl">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          Cómo funciona
        </p>
        <h2 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
          Una herramienta de trabajo, no una landing más.
        </h2>
      </div>
      <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.titulo} className="bg-surface p-6">
            <f.icon className="h-5 w-5 text-primary" strokeWidth={2} aria-hidden />
            <h3 className="mt-3.5 text-[15px] font-semibold text-ink">
              {f.titulo}
            </h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
              {f.texto}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Planes() {
  return (
    <section id="planes" className="border-t border-line bg-surface/40">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-10 text-center">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            Planes
          </p>
          <h2 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
            Precios claros, en RD$.
          </h2>
          <p className="mt-2 text-[14px] text-muted">
            {DIAS_PRUEBA} días de prueba en cualquier plan. Sin tarjeta para
            empezar.
          </p>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-3">
          {PLANES.map((plan) => {
            const esCorporativo = plan.precioMensual === null;
            return (
              <div
                key={plan.id}
                className={`flex h-full flex-col rounded-xl border bg-surface p-6 shadow-card ${
                  plan.destacado ? "border-primary ring-1 ring-primary" : "border-line"
                }`}
              >
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-lg font-semibold text-ink">
                    {plan.nombre}
                  </h3>
                  {plan.destacado && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-primary">
                      Popular
                    </span>
                  )}
                </div>
                <p className="mt-1 min-h-[2.5rem] text-[13px] text-muted">
                  {plan.resumen}
                </p>
                <p className="mt-3 flex items-baseline gap-1">
                  <span className="font-display text-3xl font-semibold tabular-nums text-ink">
                    {precioLegible(plan)}
                  </span>
                  {!esCorporativo && (
                    <span className="text-[13px] text-muted">/mes</span>
                  )}
                </p>

                {esCorporativo ? (
                  <a
                    href={`mailto:${CONTACTO}?subject=Plan%20Corporativo%20adjudicado.app`}
                    className="mt-5 inline-flex items-center justify-center rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
                  >
                    Contactar ventas
                  </a>
                ) : (
                  <Link
                    href={`/registro?plan=${plan.id}`}
                    className={`mt-5 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                      plan.destacado
                        ? "bg-primary text-primary-ink shadow-card hover:bg-primary-hover"
                        : "border border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink"
                    }`}
                  >
                    Empezar prueba
                  </Link>
                )}

                <ul className="mt-6 space-y-2.5 border-t border-line pt-5">
                  {plan.incluye.map((linea) => (
                    <li key={linea} className="flex items-start gap-2.5 text-[13.5px] text-ink-soft">
                      <Check
                        className="mt-0.5 h-4 w-4 flex-none text-primary"
                        strokeWidth={2.4}
                        aria-hidden
                      />
                      {linea}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CtaFinal() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="rounded-2xl border border-line bg-surface px-6 py-14 text-center shadow-card sm:px-12">
        <h2 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
          Que ninguna orden se caiga por un plazo.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-[15px] text-ink-soft">
          Crea la cuenta de tu empresa en un minuto y sube tu primera orden de
          compra hoy.
        </p>
        <Link
          href="/registro"
          className="mt-7 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-ink shadow-card transition-colors hover:bg-primary-hover"
        >
          Crear cuenta gratis
          <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-[13px] text-muted sm:flex-row sm:px-6">
        <LogoLockup markSize={20} textClass="text-[14px]" />
        <div className="flex items-center gap-5">
          <a href="#producto" className="transition-colors hover:text-ink">
            Producto
          </a>
          <a href="#planes" className="transition-colors hover:text-ink">
            Planes
          </a>
          <a
            href={`mailto:${CONTACTO}`}
            className="transition-colors hover:text-ink"
          >
            Contacto
          </a>
          <Link href="/login" className="transition-colors hover:text-ink">
            Entrar
          </Link>
        </div>
      </div>
    </footer>
  );
}
