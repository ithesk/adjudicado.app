import { listarFirmantes, perfilEmpresa } from "@/lib/licitaciones/queries";
import EmpresaForm from "./EmpresaForm";

export const dynamic = "force-dynamic";

export default async function EmpresaLicitacionesPage() {
  const [perfil, firmantes] = await Promise.all([
    perfilEmpresa(),
    listarFirmantes(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-ink">Datos de la empresa</h2>
        <p className="text-[13px] text-muted">
          Lo que se repite en cada licitación: datos fiscales, firmantes y los
          parámetros del cotizador. Se capturan una vez; cada paquete generado
          guarda su propia copia (los paquetes viejos no cambian).
        </p>
      </div>
      <EmpresaForm perfil={perfil} firmantes={firmantes} />
    </div>
  );
}
