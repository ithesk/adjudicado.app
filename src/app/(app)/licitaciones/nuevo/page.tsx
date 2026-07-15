import { listarInstituciones } from "@/lib/queries";
import NuevoProcesoForm from "./NuevoProcesoForm";

export const dynamic = "force-dynamic";

export default async function NuevoProcesoPage() {
  const instituciones = await listarInstituciones();
  return (
    <NuevoProcesoForm
      instituciones={instituciones.map((i) => ({ id: i.id, nombre: i.nombre }))}
    />
  );
}
