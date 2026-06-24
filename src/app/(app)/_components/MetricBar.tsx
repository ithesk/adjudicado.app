import { formatRD } from "@/lib/types";
import type { Metricas } from "@/lib/queries";

export default function MetricBar({ m }: { m: Metricas }) {
  return (
    <dl className="grid grid-cols-2 divide-x divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface shadow-card sm:grid-cols-4 sm:divide-y-0">
      <Metrica label="Órdenes vivas" valor={String(m.vivas)} />
      <Metrica
        label="Vencen ≤ 5 días"
        valor={String(m.vencenPronto)}
        tono={m.vencenPronto > 0 ? "alerta" : undefined}
      />
      <Metrica
        label="Atascado sin facturar"
        valor={formatRD(m.atascado)}
        tono={m.atascado > 0 ? "aviso" : undefined}
      />
      <Metrica label="Por cobrar" valor={formatRD(m.porCobrar)} />
    </dl>
  );
}

function Metrica({
  label,
  valor,
  tono,
}: {
  label: string;
  valor: string;
  tono?: "alerta" | "aviso";
}) {
  const color =
    tono === "alerta"
      ? "text-danger"
      : tono === "aviso"
        ? "text-warn"
        : "text-ink";
  const dot =
    tono === "alerta" ? "bg-danger" : tono === "aviso" ? "bg-warn" : null;
  return (
    <div className="px-4 py-3.5">
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
        {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />}
        <span className="truncate" title={label}>
          {label}
        </span>
      </dt>
      <dd
        className={`mt-1 font-mono text-xl font-semibold tracking-tight tabular-nums ${color}`}
      >
        {valor}
      </dd>
    </div>
  );
}
