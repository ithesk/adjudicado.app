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
    <BuscadorPrecios
      resumen={resumen}
      suplidores={suplidores.map((s) => ({ id: s.id, nombre: s.nombre }))}
    />
  );
}
