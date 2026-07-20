import { CabeceraPagina, Hoja, Panel } from "@/components/ui";
import { listarEntidadesResumen } from "@/lib/entidades/queries";
import NuevaEntidad from "./NuevaEntidad";
import CatalogoEntidades from "./CatalogoEntidades";

export const dynamic = "force-dynamic";

export default async function EntidadesPage() {
  const entidades = await listarEntidadesResumen();

  return (
    <Hoja ancho="ficha" className="space-y-4">
      <CabeceraPagina
        titulo="Entidades"
        descripcion="El catálogo único que enlazan las órdenes y las licitaciones — cada entidad con su ficha, contactos, asignación y bitácora."
        acciones={<NuevaEntidad />}
      />

      {entidades.length === 0 ? (
        <Panel className="p-8 text-center text-sm text-muted">
          Sin entidades todavía. Se crean aquí, o solas al subir una orden o un
          proceso.
        </Panel>
      ) : (
        <CatalogoEntidades entidades={entidades} />
      )}
    </Hoja>
  );
}
