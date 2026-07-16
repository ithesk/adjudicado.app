import { notFound } from "next/navigation";
import { obtenerPlantilla } from "@/lib/licitaciones/queries-plantillas";
import Editor from "./Editor";

export const dynamic = "force-dynamic";

export default async function EditorPlantillaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const plantilla = await obtenerPlantilla(id);
  if (!plantilla) notFound();

  return <Editor plantilla={plantilla} />;
}
