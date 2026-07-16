import { notFound } from "next/navigation";
import {
  listarFirmantes,
  obtenerProceso,
  perfilEmpresa,
} from "@/lib/licitaciones/queries";
import { listarInstituciones } from "@/lib/queries";
import { paramsCotizacion } from "@/lib/licitaciones/cotizador";
import BidRoom from "./BidRoom";

export const dynamic = "force-dynamic";

export default async function ProcesoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detalle, perfil, firmantes, instituciones] = await Promise.all([
    obtenerProceso(id),
    perfilEmpresa(),
    listarFirmantes(),
    listarInstituciones(),
  ]);
  if (!detalle) notFound();

  return (
    <BidRoom
      detalle={detalle}
      instituciones={instituciones.map((i) => ({ id: i.id, nombre: i.nombre }))}
      params={paramsCotizacion(detalle.proceso, perfil)}
      tieneFirmantes={firmantes.length > 0}
      tienePerfil={!!perfil}
    />
  );
}
