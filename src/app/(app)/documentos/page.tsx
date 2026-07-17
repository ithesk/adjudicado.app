import { listarDocumentos } from "@/lib/queries";
import { CabeceraPagina, Hoja } from "@/components/ui";
import DocumentosBuscador from "./DocumentosBuscador";

export const dynamic = "force-dynamic";

export default async function DocumentosPage() {
  const docs = await listarDocumentos();

  return (
    <Hoja ancho="lista" className="space-y-5">
      <CabeceraPagina
        titulo="Documentos"
        descripcion="Todos los documentos de todas las órdenes, en un solo lugar. Encuentra cualquiera al instante, sin importar la licitación."
      />
      <DocumentosBuscador docs={docs} />
    </Hoja>
  );
}
