import Link from "next/link";
import { ArrowLeft, Check, Loader2, type LucideIcon } from "lucide-react";
import { iniciales } from "@/lib/types";

// Avatar de iniciales con color (hue) determinista por nombre. Chroma baja
// para mantener el tono profesional/sobrio.
export function Avatar({
  nombre,
  size = 20,
}: {
  nombre: string | null | undefined;
  size?: number;
}) {
  let h = 0;
  for (const ch of nombre ?? "?") h = (h * 31 + ch.charCodeAt(0)) % 360;
  const bg = `oklch(0.62 0.11 ${h})`;
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full font-medium text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: bg,
        fontSize: Math.round(size * 0.42),
      }}
      aria-hidden
    >
      {iniciales(nombre)}
    </span>
  );
}

// Panel elevado consistente (borde + sombra sutil sobre el canvas).
export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-line bg-surface shadow-card ${className}`}
    >
      {children}
    </section>
  );
}

// Cabecera de sección: icono + etiqueta, jerarquía uniforme en toda la app.
export function SectionTitle({
  icon: Icon,
  children,
  right,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        <Icon className="h-4 w-4 text-muted" strokeWidth={2} aria-hidden />
        {children}
      </h2>
      {right}
    </div>
  );
}

// ============================================================
// EL SISTEMA DE PÁGINA (docs/sistema-ui.md): cabecera uniforme,
// anchos por tipo de página, y ficha con riel. La acción evidente
// va SIEMPRE arriba — nunca al fondo del scroll.
// ============================================================

// Cabecera de página: la misma tipografía en toda la app, con la acción
// principal a la derecha (patrón ERP: el botón evidente arriba).
export function CabeceraPagina({
  titulo,
  descripcion,
  volver,
  acciones,
}: {
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  volver?: string;
  acciones?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-0 items-start gap-2">
        {volver && (
          <Link
            href={volver}
            className="mt-1 flex-none rounded-md p-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label="Volver"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold text-ink">{titulo}</h1>
          {descripcion && <p className="text-sm text-muted">{descripcion}</p>}
        </div>
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  );
}

// Ancho máximo por tipo de página. Las tablas densas NO usan Hoja (van a
// todo lo ancho); todo lo demás se capa para no verse "estirado" en desktop.
const ANCHO_HOJA = {
  form: "max-w-2xl", // creación con pocos campos
  feed: "max-w-3xl", // hilos de actividad
  lista: "max-w-4xl", // listas simples y buscadores
  ficha: "max-w-[1200px]", // detalle con riel (sheet estilo Odoo)
} as const;

export function Hoja({
  ancho,
  children,
  className = "",
}: {
  ancho: keyof typeof ANCHO_HOJA;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full ${ANCHO_HOJA[ancho]} ${className}`}>
      {children}
    </div>
  );
}

// Ficha con riel (el patrón de orden/[id]): trabajo a la izquierda, consulta
// a la derecha (riel sticky de 360px). En móvil el riel se intercala entre
// `principal` y `despues` para que los datos clave no caigan al fondo.
export function DisposicionFicha({
  principal,
  riel,
  despues,
}: {
  principal: React.ReactNode;
  riel: React.ReactNode;
  despues?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div className="order-1 min-w-0 space-y-5">{principal}</div>
      <aside className="order-2 space-y-5 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
        {riel}
      </aside>
      {despues && (
        <div className="order-3 min-w-0 space-y-5 lg:col-start-1">{despues}</div>
      )}
    </div>
  );
}

// Botón primario sólido.
export function btnPrimary(extra = "") {
  return `inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-ink shadow-card transition-colors hover:bg-primary-hover disabled:opacity-55 ${extra}`;
}

// Botón secundario (contorno).
export function btnGhost(extra = "") {
  return `inline-flex items-center justify-center gap-1.5 rounded-md border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink disabled:opacity-55 ${extra}`;
}

// Input base.
export const inputBase =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink shadow-card outline-none transition-colors placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-[var(--ring)]";

// ============================================================
// FEEDBACK (docs/sistema-ui.md §carga): el vocabulario único de
// espera/éxito. Nada de spinners ad-hoc: estas primitivas + los
// avisos (toasts) cubren todos los casos.
// ============================================================

// El trío idle → guardando → ok de los autosave, en la cabecera del panel
// o de la página. Canónico (antes vivía copiado en 5 sitios).
export function IndicadorGuardado({ estado }: { estado: "idle" | "guardando" | "ok" }) {
  if (estado === "idle") return null;
  return estado === "guardando" ? (
    <span className="flex items-center gap-1 text-[11.5px] text-muted">
      <Loader2 className="h-3 w-3 motion-safe:animate-spin" strokeWidth={2} aria-hidden />
      Guardando…
    </span>
  ) : (
    <span className="flex items-center gap-1 text-[11.5px] text-ok">
      <Check className="h-3 w-3" strokeWidth={2.4} aria-hidden />
      Guardado
    </span>
  );
}

// Botón con la espera integrada: cargando ⇒ spinner + disabled, sin que el
// contenido salte (el spinner sustituye al icono, no se suma).
export function Boton({
  cargando = false,
  variante = "primary",
  className = "",
  children,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  cargando?: boolean;
  variante?: "primary" | "ghost";
}) {
  const base = variante === "primary" ? btnPrimary(className) : btnGhost(className);
  return (
    <button type="button" {...rest} disabled={disabled || cargando} className={base}>
      {cargando && (
        <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" strokeWidth={2.2} aria-hidden />
      )}
      {children}
    </button>
  );
}

// Micro-feedback JUNTO al campo editado (autosave de celdas y campos):
// punto girando mientras guarda, check ~2 s al confirmar. Tamaño fijo para
// no mover el layout. Se alimenta de useAccion: ocupada(clave) / okClave.
export function MicroGuardado({ activo, ok }: { activo: boolean; ok: boolean }) {
  return (
    <span className="inline-grid h-3.5 w-3.5 flex-none place-items-center" aria-hidden>
      {activo ? (
        <Loader2 className="h-3 w-3 motion-safe:animate-spin text-muted" strokeWidth={2.2} />
      ) : ok ? (
        <Check className="h-3 w-3 text-ok" strokeWidth={2.6} />
      ) : null}
    </span>
  );
}

// Bloque de skeleton (siluetas del contenido mientras carga una ruta —
// loading.tsx). Se compone: <Esqueleto className="h-4 w-40" />.
export function Esqueleto({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-2 ${className}`} aria-hidden />;
}

// Página de carga estándar: cabecera + filas. Para loading.tsx de listas.
export function EsqueletoPagina({ filas = 8 }: { filas?: number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Esqueleto className="h-6 w-48" />
          <Esqueleto className="h-3.5 w-72" />
        </div>
        <Esqueleto className="h-9 w-32" />
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
        <Esqueleto className="h-9 w-full rounded-none" />
        <div className="space-y-0 divide-y divide-line">
          {Array.from({ length: filas }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Esqueleto className="h-4 w-28" />
              <Esqueleto className="h-4 flex-1" />
              <Esqueleto className="h-4 w-20" />
              <Esqueleto className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
