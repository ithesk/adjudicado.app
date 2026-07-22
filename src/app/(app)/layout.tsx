import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { requireMiembro, getMembresias } from "@/lib/auth";
import { listarOrdenes } from "@/lib/queries";
import { listarDocsEmpresa } from "@/lib/empresa/queries";
import { alertasDocumentacion } from "@/lib/empresa/documentos";
import { isDemo } from "@/lib/demo";
import { ESTADO_LABEL, esViva, nombreLegible, type Estado } from "@/lib/types";
import Sidebar, { MenuMovil, type DatosSidebar } from "./_components/Sidebar";
import BuscadorGlobal, { BotonBuscar } from "./_components/BuscadorGlobal";
import { LogoLockup } from "@/components/Logo";
import Avisos from "@/components/Avisos";

const ESTADOS_NAV: { key: Estado; dot: string }[] = [
  { key: "orden_recibida", dot: "bg-muted/50" },
  { key: "en_coordinacion", dot: "bg-primary" },
  { key: "entregado", dot: "bg-warn" },
  { key: "listo_facturar", dot: "bg-warn" },
  { key: "facturado", dot: "bg-ok" },
  { key: "libramiento", dot: "bg-primary" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const miembro = await requireMiembro();
  const membresias = await getMembresias();
  const ordenes = await listarOrdenes();
  const cuenta = (e: Estado) => ordenes.filter((o) => o.estado === e).length;

  // Documentación de la empresa por vencer o vencida: la insignia solo aparece
  // si de verdad hay algo (el color de alarma es un recurso escaso).
  const alertaDocs = alertasDocumentacion(await listarDocsEmpresa());

  const datos: DatosSidebar = {
    orgNombre: miembro.organizacion?.nombre ?? "Mi empresa",
    orgActiva: miembro.org_id,
    membresias: membresias.map((m) => ({
      org_id: m.org_id,
      nombre: m.organizacion?.nombre ?? "Empresa",
    })),
    nombreUsuario: nombreLegible(miembro.nombre),
    demo: isDemo(),
    vivas: ordenes.filter((o) => esViva(o.estado)).length,
    estados: ESTADOS_NAV.map((e) => ({
      key: e.key,
      dot: e.dot,
      label: ESTADO_LABEL[e.key],
      cuenta: cuenta(e.key),
    })),
    alertaDocs: { total: alertaDocs.total, urgente: alertaDocs.urgente },
  };

  return (
    <div className="min-h-screen md:flex">
      {/* ===== Sidebar (desktop): colapsable a rail, secciones plegables ===== */}
      <Sidebar datos={datos} />

      {/* ===== Top bar (móvil): con menú completo en drawer ===== */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-canvas/90 px-4 py-2.5 backdrop-blur md:hidden">
        <div className="flex items-center gap-1">
          <MenuMovil datos={datos} />
          <Link href="/" className="flex items-center">
            <LogoLockup markSize={22} textClass="text-sm" />
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <BotonBuscar className="grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink">
            <Search className="h-5 w-5" strokeWidth={2} aria-hidden />
            <span className="sr-only">Buscar en todo</span>
          </BotonBuscar>
          <Link
            href="/orden/nueva"
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[13px] font-medium text-primary-ink"
          >
            <Plus className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            Nueva
          </Link>
        </div>
      </header>

      {/* ===== Contenido ===== */}
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 xl:px-10">
          {children}
        </div>
      </main>

      {/* Buscador global (Cmd/Ctrl+K), montado una vez */}
      <BuscadorGlobal />

      {/* Avisos (toasts), montados una vez */}
      <Avisos />
    </div>
  );
}
