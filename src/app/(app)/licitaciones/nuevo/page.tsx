import { listarInstituciones } from "@/lib/queries";
import NuevoProcesoForm from "./NuevoProcesoForm";
import { CabeceraPagina, Hoja } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NuevoProcesoPage() {
  const instituciones = await listarInstituciones();
  return (
    <Hoja ancho="form" className="space-y-5">
      <CabeceraPagina
        volver="/licitaciones"
        titulo="Nuevo proceso"
        descripcion="Los datos del pliego; el resto del expediente se arma en la Bid Room."
      />
      <NuevoProcesoForm
        instituciones={instituciones.map((i) => ({ id: i.id, nombre: i.nombre }))}
      />
    </Hoja>
  );
}
