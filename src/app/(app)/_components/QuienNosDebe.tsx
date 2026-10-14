// «Quién nos debe» — el dinero vivo por institución. Después de saber
// cuánto hay facturado o en libramiento, la pregunta es A QUIÉN hay que
// llamar: aquí está cada entidad con lo que nos debe, lo entregado que aún
// no le cobramos, cuánto lleva esperando la factura más vieja y, con el
// historial, cuánto suele tardar en pagar. Cada fila filtra la bandeja.

import Link from "next/link";
import { Landmark } from "lucide-react";
import { Panel, SectionTitle } from "@/components/ui";
import { porInstitucion, type InstitucionDinero } from "@/lib/dinero";
import { formatCorto, formatRD, type Orden } from "@/lib/types";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const TH = "bg-surface-2 px-3 py-2 font-medium";

function Monto({ valor, n }: { valor: number; n: number }) {
  if (n === 0) return <span className="text-muted">—</span>;
  return (
    <span className="block" title={`${formatRD(valor)} en ${plural(n, "orden", "órdenes")}`}>
      <span className="font-mono text-[12.5px] font-medium tabular-nums text-ink">
        {formatCorto(valor)}
      </span>
      <span className="ml-1 font-mono text-[10.5px] text-muted">{n}</span>
    </span>
  );
}

// Cuánto lleva esperando la factura más vieja, con el color del retraso
// frente a lo que esa institución suele tardar (o 30 días si no se sabe).
function Espera({ f }: { f: InstitucionDinero }) {
  if (f.esperaMax === null) return <span className="text-muted">—</span>;
  const referencia = f.pagaEnDias ?? 30;
  const tono =
    f.esperaMax > referencia * 1.5
      ? "bg-danger-soft text-danger"
      : f.esperaMax > referencia
        ? "bg-warn-soft text-warn"
        : "bg-surface-2 text-ink";
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 font-mono text-xs font-medium ${tono}`}
      title="Días desde la factura más vieja sin cobrar"
    >
      {f.esperaMax} d
    </span>
  );
}

export default function QuienNosDebe({ ordenes }: { ordenes: Orden[] }) {
  const filas = porInstitucion(ordenes);
  if (filas.length === 0) return null;
  const totalDeben = filas.reduce((s, f) => s + f.porCobrar, 0);
  const nDeben = filas.filter((f) => f.porCobrarN > 0).length;

  return (
    <Panel className="overflow-hidden">
      <SectionTitle
        icon={Landmark}
        right={
          <span
            className="min-w-0 truncate pl-2 font-mono text-[12px] tabular-nums text-muted"
            title={formatRD(totalDeben)}
          >
            {formatCorto(totalDeben)} por cobrar · {plural(nDeben, "institución", "instituciones")}
          </span>
        }
      >
        Quién nos debe
      </SectionTitle>

      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
            <th scope="col" className={TH}>Institución</th>
            <th scope="col" className={`${TH} w-[120px] text-right`}>Por cobrar</th>
            <th scope="col" className={`${TH} w-[120px] text-right`}>Sin facturar</th>
            <th scope="col" className={`${TH} hidden w-[120px] text-right md:table-cell`}>Por entregar</th>
            <th scope="col" className={`${TH} w-[90px] text-right`}>Esperando</th>
            <th scope="col" className={`${TH} hidden w-[110px] text-right md:table-cell`}>Suele pagar</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr
              key={f.institucion}
              className="border-b border-line transition-colors last:border-0 hover:bg-surface-2 focus-within:bg-surface-2"
            >
              <td className="px-3 py-2 align-middle">
                <Link
                  href={`/?institucion=${encodeURIComponent(f.institucion)}`}
                  prefetch={false}
                  className="block truncate text-[13px] font-medium text-ink hover:text-primary"
                  title={`Ver las órdenes vivas de ${f.institucion}`}
                >
                  {f.institucion}
                </Link>
              </td>
              <td className="px-3 py-2 text-right align-middle">
                <Monto valor={f.porCobrar} n={f.porCobrarN} />
              </td>
              <td className="px-3 py-2 text-right align-middle">
                <Monto valor={f.sinFacturar} n={f.sinFacturarN} />
              </td>
              <td className="hidden px-3 py-2 text-right align-middle md:table-cell">
                <Monto valor={f.porEntregar} n={f.porEntregarN} />
              </td>
              <td className="px-3 py-2 text-right align-middle">
                <Espera f={f} />
              </td>
              <td className="hidden px-3 py-2 text-right align-middle md:table-cell">
                {f.pagaEnDias === null ? (
                  <span className="text-[11px] text-muted" title="Aún no hay cobros con fecha de factura y de pago">
                    sin datos
                  </span>
                ) : (
                  <span
                    className="font-mono text-xs text-ink-soft"
                    title={`Mediana de ${plural(f.pagosMedidos, "cobro medido", "cobros medidos")}, de la factura al pago`}
                  >
                    {f.pagaEnDias} d
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
