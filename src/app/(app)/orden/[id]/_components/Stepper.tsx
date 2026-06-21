import { ESTADO_LABEL, ESTADOS, type Estado } from "@/lib/types";

export default function Stepper({ estado }: { estado: Estado }) {
  const actual = ESTADOS.indexOf(estado);
  const paso = actual + 1;
  const total = ESTADOS.length;

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Estado actual
          </p>
          <p className="text-base font-semibold tracking-tight text-ink">
            {ESTADO_LABEL[estado]}
          </p>
        </div>
        <p className="font-mono text-xs text-muted">
          Paso {paso} / {total}
        </p>
      </div>

      {/* Barra de progreso segmentada */}
      <div className="mt-3 flex gap-1" role="progressbar" aria-valuenow={paso} aria-valuemax={total}>
        {ESTADOS.map((e, i) => {
          const hecho = i < actual;
          const esActual = i === actual;
          return (
            <div
              key={e}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                esActual
                  ? "bg-primary"
                  : hecho
                    ? "bg-primary/45"
                    : "bg-line"
              }`}
              title={ESTADO_LABEL[e]}
            />
          );
        })}
      </div>

      {/* Hitos clave en texto, sin saturar */}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
        {ESTADOS.map((e, i) => (
          <span
            key={e}
            className={
              i === actual
                ? "font-medium text-ink"
                : i < actual
                  ? "text-ink-soft"
                  : ""
            }
          >
            {ESTADO_LABEL[e]}
          </span>
        ))}
      </div>
    </div>
  );
}
