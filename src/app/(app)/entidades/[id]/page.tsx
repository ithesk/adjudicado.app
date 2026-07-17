import { notFound } from "next/navigation";
import { obtenerEntidadDetalle } from "@/lib/entidades/queries";
import { listarGrupos, listarPersonas } from "@/lib/queries";
import FichaEntidad from "./FichaEntidad";

export const dynamic = "force-dynamic";

export default async function EntidadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detalle, personas, grupos] = await Promise.all([
    obtenerEntidadDetalle(id),
    listarPersonas(),
    listarGrupos(),
  ]);
  if (!detalle) notFound();

  return (
    <FichaEntidad
      detalle={detalle}
      personas={personas}
      grupos={grupos.map((g) => ({ id: g.id, nombre: g.nombre }))}
    />
  );
}
