import { listarPlantillas } from "@/lib/licitaciones/queries-plantillas";
import PlantillasLista from "./PlantillasLista";

export const dynamic = "force-dynamic";

export default async function PlantillasPage() {
  const plantillas = await listarPlantillas();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-ink">Plantillas de documentos</h2>
        <p className="text-[13px] text-muted">
          Sube un Word, arrastra las variables sobre sus huecos y la plantilla
          queda lista para generarse con los datos de cualquier proceso — sin
          tocar código. Los 7 documentos del sistema (formularios SNCC y cartas)
          ya vienen incluidos.
        </p>
      </div>
      <PlantillasLista plantillas={plantillas} />
    </div>
  );
}
