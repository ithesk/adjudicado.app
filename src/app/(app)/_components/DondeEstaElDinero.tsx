// «¿Dónde está el dinero?» — el bloque de inteligencia de la bandeja. La
// barra de métricas da cifras sueltas; esto pone el dinero vivo en UNA
// línea, de izquierda a derecha, en el orden en que avanza hacia la cuenta
// (por entregar → sin facturar → facturado → libramiento), y al lado el
// ritmo: cuánto entró y cuánto se cobró, este mes, este año y mes a mes.
//
// Componente de servidor: no tiene estado; cada tramo es un enlace al
// filtro de la bandeja, así «ver las órdenes de ese tramo» es un clic.

import Link from "next/link";
import { Wallet } from "lucide-react";
import { Panel, SectionTitle } from "@/components/ui";
import { dondeEstaElDinero, type TramoDinero } from "@/lib/dinero";
import { formatCorto, formatRD, type Orden } from "@/lib/types";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// El aviso de un tramo: lo vencido manda; si no, cuánto lleva parada la
// orden más vieja (solo cuando ya es para preocuparse).
function avisoTramo(t: TramoDinero): { texto: string; tono: string } | null {
  if (t.vencidas > 0) {
    return { texto: plural(t.vencidas, "vencida", "vencidas"), tono: "text-danger" };
  }
  if (t.key !== "por_entregar" && t.esperaMax !== null && t.esperaMax >= 15) {
    return { texto: `la más vieja lleva ${t.esperaMax} d`, tono: "text-warn" };
  }
  return null;
}

export default function DondeEstaElDinero({ ordenes }: { ordenes: Orden[] }) {
  const d = dondeEstaElDinero(ordenes);
  if (d.vivasN === 0 && d.cobradoAnioN === 0) return null;

  const anio = new Date().getFullYear();
  const tope = Math.max(1, ...d.meses.map((m) => Math.max(m.generado, m.cobrado)));
  // Un mes con algo, por poco que sea, se tiene que VER.
  const alto = (v: number) => (v <= 0 ? 0 : Math.max(4, Math.round((v / tope) * 100)));

  return (
    <Panel className="overflow-hidden">
      <SectionTitle
        icon={Wallet}
        right={
          <span
            className="min-w-0 truncate pl-2 font-mono text-[12px] tabular-nums text-muted"
            title={formatRD(d.totalVivo)}
          >
            {formatCorto(d.totalVivo)} en juego · {plural(d.vivasN, "orden", "órdenes")}
          </span>
        }
      >
        Dónde está el dinero
      </SectionTitle>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_230px]">
        {/* ===== El embudo del dinero vivo ===== */}
        <div className="min-w-0 space-y-3">
          <div
            className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
            role="img"
            aria-label={d.tramos
              .map((t) => `${t.label}: ${formatRD(t.monto)} (${t.pct} %)`)
              .join("; ")}
          >
            {d.tramos
              .filter((t) => t.monto > 0)
              .map((t) => (
                <span
                  key={t.key}
                  className={`h-full ${t.color}`}
                  style={{ width: `${t.pct}%` }}
                  title={`${t.label}: ${formatRD(t.monto)}`}
                />
              ))}
          </div>

          {/* 2×2 siempre: el panel comparte fila con el de licitaciones y
              en cuatro columnas ni la etiqueta ni el monto cabían enteros. */}
          <ul className="grid grid-cols-2 gap-x-3 gap-y-2">
            {d.tramos.map((t) => {
              const aviso = avisoTramo(t);
              return (
                <li key={t.key} className="min-w-0">
                  <Link
                    href={t.href}
                    prefetch={false}
                    title={`${formatRD(t.monto)} — ${t.siguiente}. Ver estas órdenes`}
                    className="-mx-1.5 block rounded-md px-1.5 py-1 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${t.color}`} aria-hidden />
                      <span className="truncate">{t.label}</span>
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[15px] font-semibold tabular-nums text-ink">
                      {formatCorto(t.monto)}
                    </span>
                    <span className="block truncate text-[11.5px] text-muted">
                      {plural(t.n, "orden", "órdenes")}
                      {t.monto > 0 && ` · ${t.pct} %`}
                    </span>
                    {aviso && (
                      <span className={`block truncate text-[11.5px] font-medium ${aviso.tono}`}>
                        {aviso.texto}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* ===== El ritmo: lo que entra y lo que se cobra ===== */}
        <div className="min-w-0 space-y-2.5 border-t border-line pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
          <Ritmo
            label="Cobrado este mes"
            valor={d.cobradoMes}
            n={d.cobradoMesN}
            tono="text-ok"
          />
          <Ritmo label={`Cobrado en ${anio}`} valor={d.cobradoAnio} n={d.cobradoAnioN} tono="text-ok" />
          <Ritmo label={`Entró en ${anio}`} valor={d.generadoAnio} n={d.generadoAnioN} tono="text-ink" />

          <div className="pt-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Entró frente a cobrado, 6 meses
            </p>
            <div className="mt-1.5 flex items-end gap-1.5">
              {d.meses.map((m) => (
                <div
                  key={m.clave}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1"
                  title={`${m.label}: entró ${formatRD(m.generado)} (${plural(m.generadoN, "orden", "órdenes")}) · cobrado ${formatRD(m.cobrado)} (${plural(m.cobradoN, "orden", "órdenes")})`}
                >
                  <div className="flex h-12 w-full items-end gap-px">
                    <span
                      className="flex-1 rounded-t-sm bg-primary/30"
                      style={{ height: `${alto(m.generado)}%` }}
                    />
                    <span
                      className="flex-1 rounded-t-sm bg-ok"
                      style={{ height: `${alto(m.cobrado)}%` }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-muted">{m.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-1 flex gap-3 text-[10.5px] text-muted">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-primary/30" aria-hidden />
                entró
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-ok" aria-hidden />
                cobrado
              </span>
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Ritmo({
  label,
  valor,
  n,
  tono,
}: {
  label: string;
  valor: number;
  n: number;
  tono: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="min-w-0 truncate text-[12px] text-muted">{label}</span>
      <span className="shrink-0 text-right">
        <span
          className={`font-mono text-[14px] font-semibold tabular-nums ${tono}`}
          title={formatRD(valor)}
        >
          {formatCorto(valor)}
        </span>
        <span className="ml-1.5 font-mono text-[10.5px] text-muted">{n}</span>
      </span>
    </div>
  );
}
