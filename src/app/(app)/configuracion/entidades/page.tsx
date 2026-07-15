import { listarInstituciones } from "@/lib/queries";
import EntidadesEditor from "./EntidadesEditor";

export const dynamic = "force-dynamic";

export default async function EntidadesPage() {
  const entidades = await listarInstituciones();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-ink">Entidades del Estado</h2>
        <p className="text-[13px] text-muted">
          El catálogo único de entidades convocantes: la misma entidad cuando
          licitas y cuando llega su orden de compra. Las órdenes nuevas se
          enlazan solas por nombre; aquí completas siglas, RNC y dirección
          (los formularios oficiales los piden). Los cambios se guardan solos.
        </p>
      </div>
      <EntidadesEditor entidades={entidades} />
    </div>
  );
}
