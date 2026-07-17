import { notFound } from "next/navigation";
import {
  listarFirmantes,
  obtenerProceso,
  perfilEmpresa,
} from "@/lib/licitaciones/queries";
import { listarInstituciones } from "@/lib/queries";
import { listarPlantillas } from "@/lib/licitaciones/queries-plantillas";
import { paramsCotizacion } from "@/lib/licitaciones/cotizador";
import BidRoom from "./BidRoom";

export const dynamic = "force-dynamic";

export default async function ProcesoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detalle, perfil, firmantes, instituciones, plantillas] = await Promise.all([
    obtenerProceso(id),
    perfilEmpresa(),
    listarFirmantes(),
    listarInstituciones(),
    listarPlantillas(),
  ]);
  if (!detalle) notFound();

  return (
    <BidRoom
      detalle={detalle}
      instituciones={instituciones.map((i) => ({ id: i.id, nombre: i.nombre }))}
      plantillasOrg={plantillas
        .filter((p) => p.estado === "lista")
        .map((p) => ({ codigo: p.codigo, nombre: p.nombre }))}
      params={paramsCotizacion(detalle.proceso, perfil)}
      tieneFirmantes={firmantes.length > 0}
      tienePerfil={!!perfil}
    />
  );
}
