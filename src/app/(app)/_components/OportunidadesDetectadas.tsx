// Oportunidades que el barrido dejó para esta empresa: lo que la DGCP
// publicó (API y portal) y el radar considera nuestro, con el reloj
// corriendo. Es el «qué hay hoy» sin tener que preguntarlo, y la alerta de
// que una de las dos fuentes está coja (si la API lleva un día atrasada o
// el portal no se dejó leer, aquí se dice: callar es perder licitaciones).

import { ArrowUpRight, Radar, TriangleAlert } from "lucide-react";
import { Panel, SectionTitle } from "@/components/ui";
import { diasRestantes, formatCorto, nivelUrgencia } from "@/lib/types";
import {
  alertaFuentes,
  type OportunidadDetectada,
  type SaludFuentes,
} from "@/lib/licitaciones/oportunidades";
import { ChipCierre } from "../licitaciones/_components/Chips";

const NIVEL: Record<OportunidadDetectada["nivel"], { texto: string; clase: string }> = {
  alta: { texto: "socio", clase: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  media: { texto: "TI", clase: "bg-sky-50 text-sky-700 border-sky-200" },
  explorar: { texto: "explorar", clase: "bg-surface-2 text-muted border-line" },
};

function haceCuanto(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 36) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

export default function OportunidadesDetectadas({
  filas,
  salud,
}: {
  filas: OportunidadDetectada[];
  salud: SaludFuentes | null;
}) {
  const alerta = alertaFuentes(salud);
  if (filas.length === 0 && !alerta) return null;

  return (
    <Panel className="overflow-hidden">
      <SectionTitle
        icon={Radar}
        right={
          salud ? (
            <span className="text-[11.5px] text-muted" title={`API hasta ${salud.api_hasta ?? "?"} · portal hasta ${salud.portal_hasta ?? "?"}`}>
              barrido {haceCuanto(salud.revisado_at)}
              {salud.nuevos_del_portal > 0 ? ` · ${salud.nuevos_del_portal} del portal` : ""}
            </span>
          ) : null
        }
      >
        Oportunidades detectadas
      </SectionTitle>

      {alerta && (
        <p className="flex items-start gap-2 border-b border-line bg-amber-50 px-4 py-2 text-[12.5px] text-amber-800">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
          {alerta}
        </p>
      )}

      {filas.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-muted">Nada nuevo para nosotros en el último barrido.</p>
      ) : (
        <ul className="divide-y divide-line">
          {filas.map((o) => {
            const dias = diasRestantes(o.cierre);
            const nivel = NIVEL[o.nivel];
            return (
              <li key={o.id}>
                <a
                  href={o.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]"
                >
                  <span className="w-[88px] shrink-0">
                    <ChipCierre dias={dias} nivel={nivelUrgencia(dias)} esSub={false} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-mono text-[12px] text-ink">{o.codigo}</span>
                      <span className={`rounded border px-1 text-[10.5px] font-medium ${nivel.clase}`}>
                        {o.socios.length ? o.socios.join(", ") : nivel.texto}
                      </span>
                      {o.origen === "portal" && (
                        <span className="rounded border border-line px-1 text-[10.5px] text-muted" title="Recién publicado: aún no está en datos abiertos">
                          nuevo
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[12px] text-muted" title={o.titulo}>
                      {o.institucion ? `${o.institucion} · ` : ""}
                      {o.titulo}
                    </span>
                  </span>
                  <span className="w-[84px] shrink-0 text-right font-mono text-[12.5px] tabular-nums text-ink">
                    {o.monto !== null ? formatCorto(o.monto, o.divisa) : <span className="text-[11px] text-muted">sin monto</span>}
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={2} aria-hidden />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
