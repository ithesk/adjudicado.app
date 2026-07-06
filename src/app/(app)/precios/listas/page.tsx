import { listarSuplidores } from "@/lib/queries";
import { listarListasPrecios, resumenPrecios } from "@/lib/precios/queries";
import ListasManager from "./ListasManager";

export const dynamic = "force-dynamic";

export default async function ListasPreciosPage() {
  const [listas, resumen, suplidores] = await Promise.all([
    listarListasPrecios(),
    resumenPrecios(),
    listarSuplidores(),
  ]);

  return (
    <ListasManager
      listas={listas}
      resumen={resumen}
      suplidores={suplidores.map((s) => ({ id: s.id, nombre: s.nombre }))}
    />
  );
}
