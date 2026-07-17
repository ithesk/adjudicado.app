import { listarActividad } from "@/lib/queries";
import { CabeceraPagina, Hoja } from "@/components/ui";
import ActividadFeed from "./ActividadFeed";

export const dynamic = "force-dynamic";

export default async function ActividadPage() {
  const actividad = await listarActividad();

  return (
    <Hoja ancho="feed" className="space-y-5">
      <CabeceraPagina
        titulo="Bitácora general"
        descripcion="Toda la actividad de la empresa en un solo lugar: cada orden y cada ítem. Nada queda suelto."
      />
      <ActividadFeed actividad={actividad} />
    </Hoja>
  );
}
