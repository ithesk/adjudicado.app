import { notFound } from "next/navigation";
import {
  listarFirmantes,
  listarPaquetes,
  obtenerProceso,
  perfilEmpresa,
} from "@/lib/licitaciones/queries";
import { listarInstituciones } from "@/lib/queries";
import { listarPlantillas } from "@/lib/licitaciones/queries-plantillas";
import { resolverPlantillas } from "@/lib/licitaciones/plantillas";
import { paramsCotizacion } from "@/lib/licitaciones/cotizador";
import { pdfDisponible } from "@/lib/licitaciones/pdf";
import BidRoom from "./BidRoom";

export const dynamic = "force-dynamic";

export default async function ProcesoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detalle, perfil, firmantes, instituciones, plantillas, paquetes] = await Promise.all([
    obtenerProceso(id),
    perfilEmpresa(),
    listarFirmantes(),
    listarInstituciones(),
    listarPlantillas(),
    listarPaquetes(id),
  ]);
  if (!detalle) notFound();

  // La MISMA cascada que usa la generación (variante de la entidad del
  // proceso → genérica → sistema): sin esto la Bid Room decía "se genera
  // aquí" con plantillas que no aplicaban a esta entidad.
  const plantillasDelProceso = Array.from(
    resolverPlantillas(
      plantillas.filter((p) => p.estado === "lista"),
      detalle.proceso.institucion_id,
    ).values(),
  );

  return (
    <BidRoom
      detalle={detalle}
      instituciones={instituciones.map((i) => ({ id: i.id, nombre: i.nombre }))}
      plantillasOrg={plantillasDelProceso.map((p) => ({
        codigo: p.codigo,
        nombre: p.nombre,
        preguntas: p.variables_personalizadas.filter((v) => !v.valor),
      }))}
      params={paramsCotizacion(detalle.proceso, perfil)}
      tieneFirmantes={firmantes.length > 0}
      tienePerfil={!!perfil}
      pdfListo={pdfDisponible()}
      paquetes={paquetes}
    />
  );
}
