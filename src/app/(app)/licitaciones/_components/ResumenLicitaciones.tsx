// Los cuatro números del embudo de licitaciones, con su dinero: en trabajo
// (lo cotizado), en juego (lo sometido que espera decisión), ganado este
// año y la tasa de éxito. Se usa arriba de la lista y dentro del bloque de
// la bandeja; cada celda lleva al filtro correspondiente de la lista.

import Link from "next/link";
import { formatCorto, formatRD } from "@/lib/types";
import type { ResumenLicitaciones as Resumen } from "@/lib/licitaciones/resumen";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function ResumenLicitaciones({
  r,
  marco = true,
}: {
  r: Resumen;
  // Con marco propio (en la lista) o a pelo, dentro de otro panel (bandeja).
  marco?: boolean;
}) {
  const anio = new Date().getFullYear();
  const celdas = [
    {
      key: "trabajo",
      label: "En trabajo",
      valor: String(r.enTrabajo.n),
      title: r.enTrabajo.monto > 0 ? formatRD(r.enTrabajo.monto) : undefined,
      secundario:
        r.enTrabajo.monto > 0
          ? `${formatCorto(r.enTrabajo.monto)} cotizado${r.enTrabajo.conMonto < r.enTrabajo.n ? ` en ${r.enTrabajo.conMonto}` : ""}`
          : r.enTrabajo.presupuesto > 0
            ? `presupuesto ${formatCorto(r.enTrabajo.presupuesto)}`
            : r.enTrabajo.n > 0
              ? "sin cotizar"
              : "—",
      // Con cotización Y presupuesto, el presupuesto va como nota: dice
      // cuánto vale el tramo según la entidad frente a lo que cotizamos.
      nota:
        r.enTrabajo.monto > 0 && r.enTrabajo.presupuesto > 0
          ? `presupuesto ${formatCorto(r.enTrabajo.presupuesto)}`
          : null,
      extra: r.listas > 0 ? `${plural(r.listas, "lista", "listas")} para someter` : null,
      tono: "text-ink",
    },
    {
      key: "sometidas",
      label: "En juego",
      valor: formatCorto(r.enJuego.monto),
      title: formatRD(r.enJuego.monto),
      secundario: plural(r.enJuego.n, "sometida", "sometidas"),
      nota:
        r.enJuego.presupuesto > 0 && r.enJuego.conMonto < r.enJuego.n
          ? `presupuesto ${formatCorto(r.enJuego.presupuesto)}`
          : null,
      extra: r.subsanacion > 0 ? `${r.subsanacion} en subsanación` : null,
      tono: r.subsanacion > 0 ? "text-warn" : "text-primary",
    },
    {
      key: "ganadas",
      label: `Ganado en ${anio}`,
      valor: formatCorto(r.adjudicadasAnio.monto),
      title: formatRD(r.adjudicadasAnio.monto),
      secundario: plural(r.adjudicadasAnio.n, "adjudicada", "adjudicadas"),
      nota: null,
      extra: null,
      tono: "text-ok",
    },
    {
      key: "cerradas",
      label: "Tasa de éxito",
      valor: r.tasaExito === null ? "—" : `${r.tasaExito} %`,
      title: undefined,
      secundario:
        r.decididas > 0
          ? `${r.adjudicadas.n} de ${plural(r.decididas, "decidida", "decididas")}`
          : "ninguna decidida aún",
      nota: null,
      extra: null,
      tono: "text-ink",
    },
  ];

  return (
    <dl
      className={`grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-4 sm:divide-y-0 ${
        marco ? "overflow-hidden rounded-lg border border-line bg-surface shadow-card" : ""
      }`}
    >
      {celdas.map((c) => (
        <Link
          key={c.key}
          href={`/licitaciones?filtro=${c.key}`}
          prefetch={false}
          title={c.title}
          className="block min-w-0 px-4 py-3 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]"
        >
          <dt className="truncate text-[11px] font-medium uppercase tracking-wide text-muted">
            {c.label}
          </dt>
          <dd className="mt-1 min-w-0">
            <span
              className={`block truncate font-mono text-lg font-semibold tracking-tight tabular-nums ${c.tono}`}
            >
              {c.valor}
            </span>
            <span className="block truncate font-mono text-[11px] tabular-nums text-muted">
              {c.secundario}
            </span>
            {c.nota && (
              <span className="block truncate text-[11px] text-muted">{c.nota}</span>
            )}
            {c.extra && (
              <span className="block truncate text-[11px] font-medium text-warn">{c.extra}</span>
            )}
          </dd>
        </Link>
      ))}
    </dl>
  );
}
