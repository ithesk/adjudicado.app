import { redirect } from "next/navigation";

// El equipo ahora vive en Configuración → Equipo.
export default function MiembrosPage() {
  redirect("/configuracion/equipo");
}
