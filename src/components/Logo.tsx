// Marca de adjudicado.app — concepto "El recorrido": el expediente que asciende
// de etapa en etapa hasta el cobro (el último nodo, en azul). La polilínea usa
// currentColor para adaptarse al fondo; los nodos llevan el degradé de grises.

export function LogoMarca({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden
    >
      <polyline
        points="9,34 19,27 28,30 39,14"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="34" r="3" fill="#C7CAD1" />
      <circle cx="19" cy="27" r="3" fill="#9CA0AB" />
      <circle cx="28" cy="30" r="3" fill="#6A6E78" />
      <circle cx="39" cy="14" r="4.4" fill="#2563EB" />
    </svg>
  );
}

// Lockup: marca + wordmark "adjudicado.app" (el punto en azul de marca).
export function LogoLockup({
  className,
  markSize = 26,
  textClass = "text-lg",
}: {
  className?: string;
  markSize?: number;
  textClass?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoMarca size={markSize} className="text-ink" />
      <span
        className={`font-display font-semibold tracking-tight text-ink ${textClass}`}
      >
        adjudicado<span className="text-primary">.</span>app
      </span>
    </span>
  );
}
