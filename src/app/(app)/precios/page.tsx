import { listarSuplidores } from "@/lib/queries";
import { resumenPrecios } from "@/lib/precios/queries";
import BuscadorPrecios from "./BuscadorPrecios";

export const dynamic = "force-dynamic";

export default async function PreciosPage() {
  const [resumen, suplidores] = await Promise.all([
    resumenPrecios(),
    listarSuplidores(),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Precios</h1>
        <p className="text-sm text-muted">
          Busca precios por SKU o descripción en las listas vigentes de tus
          suplidores. Importa el Excel de cada suplidor y compara términos de
          contrato e historial.
        </p>
      </div>
      <BuscadorPrecios
        resumen={resumen}
        suplidores={suplidores.map((s) => ({ id: s.id, nombre: s.nombre }))}
      />
    </div>
  );
}
