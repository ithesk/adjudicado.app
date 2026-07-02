import { listarGrupos, listarPersonas } from "@/lib/queries";
import GruposEditor from "./GruposEditor";

export const dynamic = "force-dynamic";

export default async function GruposPage() {
  const [grupos, personas] = await Promise.all([
    listarGrupos(),
    listarPersonas(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-ink">Grupos</h2>
        <p className="text-[13px] text-muted">
          Equipos dentro de la empresa (Logística, Facturación…). Asigna órdenes
          a un grupo además de a personas, y filtra el tablero por grupo.
        </p>
      </div>
      <GruposEditor grupos={grupos} personas={personas} />
    </div>
  );
}
