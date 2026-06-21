import { listarSuplidores } from "@/lib/queries";
import { CANAL_LABEL, type CanalItem } from "@/lib/types";
import { Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

const DESCRIPCION: Record<CanalItem, string> = {
  suscripcion: "Servicios/licencias con activación directa, sin envío físico.",
  amazon: "Compra directa por Amazon Business, con tracking de envío.",
  distribuidor: "Mayorista (Ingram, TechData…). Suele requerir cotización.",
  fabricante: "Compra o confirmación directa con el fabricante.",
  directo: "Trato directo con el proveedor, sin intermediarios.",
};

export default async function CanalesPage() {
  const suplidores = await listarSuplidores();
  const cuenta = (c: CanalItem) =>
    suplidores.filter((s) => s.canal === c).length;

  return (
    <Panel>
      <ul className="divide-y divide-line">
        {(Object.keys(CANAL_LABEL) as CanalItem[]).map((c) => (
          <li key={c} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-ink">
                {CANAL_LABEL[c]}
              </p>
              <p className="text-[12px] text-muted">{DESCRIPCION[c]}</p>
            </div>
            <span className="shrink-0 font-mono text-xs text-muted">
              {cuenta(c)} suplidores
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
