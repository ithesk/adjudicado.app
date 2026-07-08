// Piezas de la línea visual pública (landing, login, registro):
// botones en mayúsculas con tracking amplio, frase resaltada en azul pálido
// y banda decorativa de puntos. Usables desde server y client components.

export const btnCta =
  "inline-flex items-center justify-center gap-2 rounded-[5px] px-5 py-3 text-[11px] font-semibold tracking-[0.09em] uppercase transition-[opacity,transform] hover:opacity-90 active:scale-[0.98]";
export const btnAzul = `${btnCta} bg-primary text-primary-ink`;
export const btnBorde = `${btnCta} border border-line-strong bg-surface text-ink-soft hover:text-ink`;

// Botón pequeño con borde azul, como el "ENTRAR" del nav de la landing.
export const btnNav =
  "rounded-[5px] border border-primary px-4 py-1.5 text-[11px] font-semibold tracking-[0.09em] text-primary uppercase transition-colors hover:bg-primary hover:text-primary-ink";

export function Resalte({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded-sm px-1.5 text-primary [box-decoration-break:clone]"
      style={{
        background: "color-mix(in srgb, var(--primary) 11%, transparent)",
      }}
    >
      {children}
    </span>
  );
}

// Banda decorativa de puntos con huecos irregulares (deterministas).
export function BandaPuntos({ filas = 6 }: { filas?: number }) {
  const cols = 46;
  const puntos: React.ReactNode[] = [];
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < cols; c++) {
      if ((f * 31 + c * 17) % 13 < 3) continue;
      puntos.push(
        <circle key={`${f}-${c}`} cx={14 + c * 26} cy={14 + f * 22} r={1.8} />,
      );
    }
  }
  const alto = filas * 22;
  return (
    <div aria-hidden className="overflow-hidden">
      <svg
        viewBox={`0 0 1200 ${alto}`}
        style={{ height: alto }}
        className="mx-auto block w-[1200px] max-w-none fill-line-strong"
        preserveAspectRatio="xMidYMid slice"
      >
        {puntos}
      </svg>
    </div>
  );
}
