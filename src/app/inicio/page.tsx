import type { Metadata } from "next";
import Link from "next/link";
import { LogoLockup } from "@/components/Logo";
import {
  BandaPuntos,
  Resalte,
  btnAzul,
  btnBorde,
  btnNav,
} from "@/components/landing-ui";
import { urgenciaChip } from "@/lib/ui";
import Reveal from "./Reveal";

export const metadata: Metadata = {
  title: "adjudicado.app — de la orden de compra al cobro",
  description:
    "Registro único del trayecto post-adjudicación para empresas que ejecutan contratos del Estado dominicano. Plazos vigilados, documentos en su sitio y todo el equipo viendo lo mismo.",
};

export default function InicioPage() {
  return (
    <div className="bg-surface text-ink">
      <Nav />
      <main>
        <Hero />
        <BandaPuntos />
        <Personas />
        <Pasos />
        <Producto />
        <CierreCta />
      </main>
      <Pie />
    </div>
  );
}

/* ---------------------------------------------------------------- nav */

function Nav() {
  return (
    <header className="bg-surface">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
        <Link href="/" aria-label="adjudicado.app">
          <LogoLockup markSize={24} textClass="text-base" />
        </Link>
        <nav className="flex items-center gap-6">
          <a
            href="#como-funciona"
            className="hidden text-[13px] text-ink-soft transition-colors hover:text-ink sm:block"
          >
            Cómo funciona
          </a>
          <Link
            href="/registro"
            className="hidden text-[13px] text-ink-soft transition-colors hover:text-ink sm:block"
          >
            Crear cuenta
          </Link>
          <Link href="/login" className={btnNav}>
            Entrar
          </Link>
        </nav>
      </div>
    </header>
  );
}

/* --------------------------------------------------------------- hero */

function Hero() {
  return (
    <section className="mx-auto grid max-w-5xl items-center gap-10 px-5 pt-10 pb-16 sm:grid-cols-[1fr_1.1fr] sm:pt-14">
      <div className="max-w-md">
        <h1 className="font-display text-4xl leading-[1.08] font-bold tracking-[-0.02em] text-ink sm:text-[2.9rem]">
          Adiós al seguimiento de memoria
        </h1>
        <p className="mt-5 max-w-xs text-[14px] leading-[1.6] text-muted">
          Sigue cada orden de compra adjudicada hasta el cobro, sin perder
          plazos ni documentos en el camino.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link href="/registro" className={btnAzul}>
            Crea tu cuenta
          </Link>
          <a href="#como-funciona" className={btnBorde}>
            <IconoOjo />
            Ve cómo funciona
          </a>
        </div>
      </div>
      <IlustracionHero />
    </section>
  );
}

/* ------------------------------------------------------------ personas */

const PERSONAS = [
  {
    etiqueta: "Gerencia",
    texto:
      "Ve el estado real de cada orden sin pedir informes: etapas, montos y plazos en una sola vista.",
    ilustracion: IlustracionGerencia,
  },
  {
    etiqueta: "Ventas y operaciones",
    texto:
      "El triage ordena el día por urgencia y la bitácora guarda cada llamada, correo y entrega.",
    ilustracion: IlustracionOperaciones,
  },
  {
    etiqueta: "Equipos",
    texto:
      "Todos ven lo mismo: documentos, contactos e historial compartidos, con invitaciones por correo.",
    ilustracion: IlustracionEquipos,
  },
];

function Personas() {
  return (
    <section className="mx-auto max-w-5xl px-5 pt-6 pb-24 text-center">
      <Reveal>
        <h2 className="font-display mx-auto max-w-2xl text-[1.6rem] leading-snug font-bold tracking-[-0.01em] text-ink sm:text-3xl">
          Hecho para empresas que ejecutan{" "}
          <Resalte>contratos del Estado</Resalte> dominicano
        </h2>
      </Reveal>
      <div className="mt-16 grid gap-12 sm:grid-cols-3">
        {PERSONAS.map((p, i) => (
          <Reveal key={p.etiqueta} delay={i * 80}>
            <div className="mx-auto flex h-[130px] max-w-[200px] items-end justify-center">
              <p.ilustracion />
            </div>
            <h3 className="mt-5 text-[12px] font-bold tracking-[0.12em] text-ink uppercase">
              {p.etiqueta}
            </h3>
            <p className="mx-auto mt-3 max-w-[17rem] text-[13px] leading-[1.65] text-muted">
              {p.texto}
            </p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- pasos */

const PASOS = [
  { n: "1", titulo: "Registra la orden adjudicada" },
  { n: "2", titulo: "Da seguimiento con tu equipo" },
  { n: "3", titulo: "Cobra con todo documentado" },
];

function Pasos() {
  return (
    <section id="como-funciona" className="mx-auto max-w-5xl px-5 py-24 text-center">
      <Reveal>
        <h2 className="font-display mx-auto max-w-2xl text-[1.6rem] leading-snug font-bold tracking-[-0.01em] text-ink sm:text-3xl">
          El trayecto completo en <Resalte>3 pasos simples</Resalte>
        </h2>
      </Reveal>
      <Reveal className="relative mx-auto mt-14 max-w-3xl">
        {/* Línea discontinua detrás de los círculos */}
        <div
          aria-hidden
          className="absolute top-[17px] right-[16%] left-[16%] hidden border-t-2 border-dashed border-line-strong sm:block"
        />
        <ol className="relative grid gap-10 sm:grid-cols-3 sm:gap-6">
          {PASOS.map((p) => (
            <li key={p.n} className="flex flex-col items-center">
              <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-ink bg-surface text-[13px] font-bold text-ink">
                {p.n}
              </span>
              <span className="mt-4 max-w-[11rem] text-[13px] leading-snug font-semibold text-ink">
                {p.titulo}
              </span>
            </li>
          ))}
        </ol>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------ producto */

function Producto() {
  return (
    <section className="mx-auto max-w-5xl px-5 py-24 text-center">
      <Reveal>
        <h2 className="font-display mx-auto max-w-2xl text-[1.6rem] leading-snug font-bold tracking-[-0.01em] text-ink sm:text-3xl">
          Todas tus órdenes en <Resalte>un solo lugar</Resalte>
        </h2>
      </Reveal>
      <Reveal className="mt-12">
        <MaquetaApp />
      </Reveal>
    </section>
  );
}

// Maqueta del producto: ventana con sidebar y bandeja de triage, contenido
// ilustrativo con la misma semántica de semáforo del producto real.
function MaquetaApp() {
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
    <figure className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-line bg-surface text-left shadow-raised">
      <div className="flex items-center gap-1.5 border-b border-line px-4 py-2.5" aria-hidden>
        <i className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <i className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <i className="h-2.5 w-2.5 rounded-full bg-line-strong" />
      </div>
      <div className="grid sm:grid-cols-[10rem_1fr]">
        <aside className="hidden border-r border-line bg-canvas px-3 py-4 sm:block">
          <ul className="space-y-1 text-[12px] font-medium">
            <li className="rounded-md bg-surface-2 px-2.5 py-1.5 text-ink">
              Órdenes
            </li>
            <li className="px-2.5 py-1.5 text-muted">Actividad</li>
            <li className="px-2.5 py-1.5 text-muted">Documentos</li>
            <li className="px-2.5 py-1.5 text-muted">Precios</li>
            <li className="px-2.5 py-1.5 text-muted">Miembros</li>
          </ul>
        </aside>
        <div>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-display text-[14px] font-semibold text-ink">
              Hoy
            </span>
            <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-[11px] font-medium text-danger">
              1 urgente
            </span>
          </div>
          <ul className="divide-y divide-line text-[13px]">
            {filas.map((f) => (
              <li
                key={f.oc}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 px-4 py-3 sm:grid-cols-[7.5rem_1fr_6.5rem_auto]"
              >
                <span className="font-mono text-[12px] text-ink-soft">
                  {f.oc}
                </span>
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
      </div>
    </figure>
  );
}

/* ------------------------------------------------------------- cierre */

function CierreCta() {
  return (
    <section className="border-t border-line bg-canvas">
      <div className="mx-auto max-w-5xl px-5 py-20 text-center">
        <Reveal>
          <h2 className="font-display mx-auto max-w-xl text-[1.6rem] leading-snug font-bold tracking-[-0.01em] text-ink sm:text-3xl">
            Que ninguna orden se caiga por un plazo no vigilado
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[13px] leading-[1.6] text-muted">
            Crea el espacio de tu empresa en minutos e invita a tu equipo
            cuando quieras. Sin tarjeta.
          </p>
          <Link href="/registro" className={`mt-7 ${btnAzul}`}>
            Crea tu cuenta
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

function Pie() {
  return (
    <footer className="border-t border-line bg-canvas">
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

/* ------------------------------------------------------- ilustraciones */
/* Line-art propio (trazo uniforme, tinta + acento azul), estilo referencia. */

function IconoOjo() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

// Persona serena con los brazos extendidos y tarjetas de órdenes flotando:
// el caos post-adjudicación, bajo control.
function IlustracionHero() {
  return (
    <svg
      viewBox="0 0 480 390"
      fill="none"
      stroke="var(--ink-soft)"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-full"
      role="img"
      aria-label="Persona tranquila rodeada de órdenes de compra en orden"
    >
      {/* tarjetas flotantes */}
      <g>
        <rect x="52" y="38" width="92" height="64" rx="7" fill="var(--surface)" />
        <path d="M66 56h48M66 70h64M66 84h36" strokeWidth="2" />
        <circle cx="128" cy="56" r="7" fill="var(--primary)" stroke="none" />
        <path d="M125 56l2.4 2.4 4-4.6" stroke="var(--primary-ink)" strokeWidth="1.7" />
      </g>
      <g>
        <rect x="330" y="26" width="96" height="60" rx="7" fill="var(--surface)" />
        <path d="M344 44h52M344 58h66M344 72h40" strokeWidth="2" />
        <rect x="398" y="38" width="20" height="9" rx="4.5" fill="var(--primary)" stroke="none" />
      </g>
      <g>
        <rect x="392" y="128" width="76" height="52" rx="7" fill="var(--surface)" />
        <path d="M404 145h40M404 158h52" strokeWidth="2" />
        <circle cx="452" cy="145" r="6" fill="var(--primary)" stroke="none" />
        <path d="M449.5 145l2 2 3.4-3.8" stroke="var(--primary-ink)" strokeWidth="1.5" />
      </g>
      <g>
        <rect x="176" y="14" width="84" height="30" rx="7" fill="var(--surface)" />
        <path d="M190 29h34" strokeWidth="2" />
        <circle cx="240" cy="29" r="5" fill="var(--primary)" stroke="none" />
      </g>
      {/* chispas */}
      <path d="M300 60l0 10M295 65l10 0" strokeWidth="2" />
      <path d="M40 150l0 8M36 154l8 0" strokeWidth="2" />
      <circle cx="330" cy="110" r="2.4" fill="var(--ink-soft)" stroke="none" />
      <circle cx="150" cy="120" r="2.4" fill="var(--ink-soft)" stroke="none" />

      {/* persona */}
      {/* piernas cruzadas (debajo del torso) */}
      <path
        d="M240 216c-19 0-36 9-42 25 13 7 27 10 42 10s29-3 42-10c-6-16-23-25-42-25Z"
        fill="var(--surface)"
      />
      <path d="M221 243c8-10 21-13 31-6M259 243c-8-10-21-13-31-6" strokeWidth="2" />
      {/* torso */}
      <path
        d="M240 174c-19 0-31 13-34 32l-2 14c23 7 49 7 72 0l-2-14c-3-19-15-32-34-32Z"
        fill="var(--surface)"
      />
      {/* brazos extendidos */}
      <path d="M210 191c-14 9-32 13-52 11" />
      <circle cx="152" cy="203" r="5" fill="var(--surface)" />
      <path d="M270 191c14 9 32 13 52 11" />
      <circle cx="328" cy="203" r="5" fill="var(--surface)" />
      {/* cabeza */}
      <circle cx="240" cy="147" r="26" fill="var(--surface)" />
      <path d="M217 138c4-13 15-19 25-18 11 1 19 8 21 18" fill="none" />
      <circle cx="231" cy="149" r="5.2" />
      <circle cx="249" cy="149" r="5.2" />
      <path d="M236.2 149h7.6" strokeWidth="2" />
      <path d="M234 162c3.6 2.6 8.4 2.6 12 0" strokeWidth="2" />
      {/* alfombra */}
      <path d="M180 264h120" />
      {/* laptop al frente */}
      <g>
        <rect x="210" y="290" width="60" height="34" rx="4" fill="var(--surface)" />
        <path d="M200 324h80l-8 12h-64l-8-12Z" fill="var(--surface)" />
        <circle cx="240" cy="307" r="6.5" stroke="var(--primary)" />
        <path d="M237.5 307l2 2 3.6-4" stroke="var(--primary)" strokeWidth="1.8" />
      </g>
      {/* planta izquierda */}
      <g>
        <path d="M96 330h44l-5 32h-34l-5-32Z" fill="var(--surface)" />
        <path d="M118 330c0-20-10-34-24-40M118 330c0-22 8-38 22-44M118 330c-2-14-2-26 0-36" />
      </g>
      {/* mesa derecha con café y documentos */}
      <g>
        <path d="M344 336h84M356 336v26M416 336v26" />
        <rect x="354" y="312" width="30" height="24" rx="3" fill="var(--surface)" />
        <path d="M384 318h7c5 0 5 10 0 10h-7" fill="none" />
        <path d="M396 336v-16h28v16" fill="var(--surface)" />
        <path d="M396 326h28" strokeWidth="2" />
      </g>
    </svg>
  );
}

function bustos(props: React.SVGProps<SVGSVGElement>) {
  return {
    viewBox: "0 0 200 150",
    fill: "none",
    stroke: "var(--ink-soft)",
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-full",
    "aria-hidden": true,
    ...props,
  };
}

// Gerencia: figura revisando un panel con gráfico.
function IlustracionGerencia() {
  return (
    <svg {...bustos({})}>
      <rect x="94" y="22" width="84" height="62" rx="7" fill="var(--surface)" />
      <path d="M108 72v-16M124 72v-26M140 72v-10" strokeWidth="5" />
      <path d="M156 72v-32" strokeWidth="5" stroke="var(--primary)" />
      <path d="M104 34h36" strokeWidth="2" />
      {/* figura */}
      <circle cx="52" cy="78" r="20" fill="var(--surface)" />
      <path d="M36 72c4-10 13-14 21-13 8 1 13 6 15 13" />
      <circle cx="46" cy="80" r="1.8" fill="var(--ink-soft)" stroke="none" />
      <circle cx="60" cy="80" r="1.8" fill="var(--ink-soft)" stroke="none" />
      <path d="M49 89c2.4 1.8 5.6 1.8 8 0" strokeWidth="2" />
      <path d="M52 98c-16 0-26 10-28 26l-2 24" fill="var(--surface)" />
      <path d="M52 98c16 0 26 10 28 26l2 24" fill="none" />
      {/* brazo señalando el panel */}
      <path d="M74 112c8-8 16-16 24-22" />
      <circle cx="102" cy="88" r="4" fill="var(--surface)" />
    </svg>
  );
}

// Operaciones: figura con lista de pendientes y reloj.
function IlustracionOperaciones() {
  return (
    <svg {...bustos({})}>
      <rect x="112" y="30" width="66" height="78" rx="7" fill="var(--surface)" />
      <circle cx="126" cy="50" r="5" stroke="var(--primary)" />
      <path d="M124 50l1.6 1.6 2.8-3.2" stroke="var(--primary)" strokeWidth="1.6" />
      <path d="M138 50h30" strokeWidth="2" />
      <circle cx="126" cy="70" r="5" stroke="var(--primary)" />
      <path d="M124 70l1.6 1.6 2.8-3.2" stroke="var(--primary)" strokeWidth="1.6" />
      <path d="M138 70h24" strokeWidth="2" />
      <circle cx="126" cy="90" r="5" />
      <path d="M138 90h28" strokeWidth="2" />
      {/* reloj */}
      <circle cx="176" cy="22" r="12" fill="var(--surface)" />
      <path d="M176 15v7l5 3" strokeWidth="2" />
      {/* figura */}
      <circle cx="58" cy="76" r="20" fill="var(--surface)" />
      <path d="M42 70c4-10 13-14 21-13 8 1 13 6 15 13" />
      <path d="M44 74h10M60 74h10" strokeWidth="2" />
      <circle cx="49" cy="78" r="1.8" fill="var(--ink-soft)" stroke="none" />
      <circle cx="65" cy="78" r="1.8" fill="var(--ink-soft)" stroke="none" />
      <path d="M54 87c2.4 1.8 5.6 1.8 8 0" strokeWidth="2" />
      <path d="M58 96c-16 0-26 10-28 26l-2 26" fill="var(--surface)" />
      <path d="M58 96c16 0 26 10 28 26l2 26" fill="none" />
      <path d="M80 110c8-4 18-6 28-6" />
      <circle cx="112" cy="104" r="4" fill="var(--surface)" />
    </svg>
  );
}

// Equipos: dos figuras chocando las manos en alto.
function IlustracionEquipos() {
  return (
    <svg {...bustos({})}>
      {/* choque */}
      <path d="M100 32l0-12M92 36l-8-8M108 36l8-8" stroke="var(--primary)" strokeWidth="2.4" />
      {/* figura izquierda */}
      <circle cx="62" cy="72" r="18" fill="var(--surface)" />
      <path d="M48 66c3-9 11-13 18-12 7 1 12 6 13 12" />
      <circle cx="57" cy="74" r="1.7" fill="var(--ink-soft)" stroke="none" />
      <circle cx="69" cy="74" r="1.7" fill="var(--ink-soft)" stroke="none" />
      <path d="M58 82c2.2 1.6 5 1.6 7.2 0" strokeWidth="2" />
      <path d="M62 90c-14 0-23 9-25 24l-2 32" fill="var(--surface)" />
      <path d="M62 90c8 0 14 2 19 7" fill="none" />
      <path d="M76 92c6-14 14-30 20-46" />
      <circle cx="97" cy="42" r="4.4" fill="var(--surface)" />
      {/* figura derecha */}
      <circle cx="140" cy="72" r="18" fill="var(--surface)" />
      <path d="M126 66c3-9 11-13 18-12 7 1 12 6 13 12" />
      <path d="M128 70h9M144 70h9" strokeWidth="2" />
      <circle cx="133" cy="74" r="1.7" fill="var(--ink-soft)" stroke="none" />
      <circle cx="147" cy="74" r="1.7" fill="var(--ink-soft)" stroke="none" />
      <path d="M136 82c2.2 1.6 5 1.6 7.2 0" strokeWidth="2" />
      <path d="M140 90c14 0 23 9 25 24l2 32" fill="var(--surface)" />
      <path d="M140 90c-8 0-14 2-19 7" fill="none" />
      <path d="M126 92c-6-14-14-30-20-46" />
      <circle cx="105" cy="42" r="4.4" fill="var(--surface)" />
    </svg>
  );
}
