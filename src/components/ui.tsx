import type { LucideIcon } from "lucide-react";
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
