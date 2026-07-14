import { listarDocsEmpresa } from "@/lib/empresa/queries";
import DocsEmpresa from "./DocsEmpresa";

export const dynamic = "force-dynamic";

export default async function EmpresaPage() {
  const docs = await listarDocsEmpresa();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-ink">
          Documentación de la empresa
        </h2>
        <p className="text-[13px] text-muted">
          Lo que hay que presentar en cada licitación. Cárgalo una vez con su
          fecha de vencimiento y el sistema avisa antes de que caduque.
        </p>
      </div>
      <DocsEmpresa docs={docs} />
    </div>
  );
}
