import { listarActividad } from "@/lib/queries";
import ActividadFeed from "./ActividadFeed";

export const dynamic = "force-dynamic";

export default async function ActividadPage() {
  const actividad = await listarActividad();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Bitácora general</h1>
        <p className="text-sm text-muted">
          Toda la actividad de la empresa en un solo lugar: cada orden y cada
          ítem. Nada queda suelto.
        </p>
      </div>
      <ActividadFeed actividad={actividad} />
    </div>
  );
}
