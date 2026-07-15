import { listarDocsEmpresa } from "@/lib/empresa/queries";
import { listarFirmantes, perfilEmpresa } from "@/lib/licitaciones/queries";
import PerfilEmpresa from "./PerfilEmpresa";
import DocsEmpresa from "./DocsEmpresa";

export const dynamic = "force-dynamic";

export default async function EmpresaPage() {
  const [docs, perfil, firmantes] = await Promise.all([
    listarDocsEmpresa(),
    perfilEmpresa(),
    listarFirmantes(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-ink">Empresa</h2>
        <p className="text-[13px] text-muted">
          Todo lo que se repite en cada licitación: datos fiscales, firmantes,
          parámetros del cotizador y la documentación legal con sus
          vencimientos. Los cambios se guardan solos.
        </p>
      </div>

      <PerfilEmpresa perfil={perfil} firmantes={firmantes} />

      <div>
        <h3 className="mb-2 text-[13px] font-semibold text-ink">
          Documentación de la empresa
        </h3>
        <DocsEmpresa docs={docs} />
      </div>
    </div>
  );
}
