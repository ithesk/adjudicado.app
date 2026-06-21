import { listarDocumentos } from "@/lib/queries";
import DocumentosBuscador from "./DocumentosBuscador";

export const dynamic = "force-dynamic";

export default async function DocumentosPage() {
  const docs = await listarDocumentos();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Documentos</h1>
        <p className="text-sm text-muted">
          Todos los documentos de todas las órdenes, en un solo lugar. Encuentra
          cualquiera al instante, sin importar la licitación.
        </p>
      </div>
      <DocumentosBuscador docs={docs} />
    </div>
  );
}
