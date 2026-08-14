import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { requireMiembro, getMembresias } from "@/lib/auth";
import { listarOrdenes } from "@/lib/queries";
import { listarDocsEmpresa } from "@/lib/empresa/queries";
import { alertasDocumentacion } from "@/lib/empresa/documentos";
import { listarProcesos, subsanacionesAbiertas } from "@/lib/licitaciones/queries";
import { construirAlertas } from "@/lib/alertas";
import { isDemo } from "@/lib/demo";
import { ESTADO_LABEL, esViva, nombreLegible, type Estado } from "@/lib/types";
import Sidebar, { MenuMovil, type DatosSidebar } from "./_components/Sidebar";
import BuscadorGlobal, { BotonBuscar } from "./_components/BuscadorGlobal";
import BarraAlertas from "./_components/BarraAlertas";
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
  // El layout se re-renderiza en CADA navegación y en cada router.refresh():
  // en fila, sus cuatro consultas sumaban sus latencias antes de pintar nada.
  // requireMiembro va primero porque decide el redirect; el resto va en
  // paralelo (la sesión ya viene memoizada, así que no se repite el viaje).
  const miembro = await requireMiembro();
  const [membresias, ordenes, docs, procesos, subsanaciones] = await Promise.all([
    getMembresias(),
    listarOrdenes(),
    listarDocsEmpresa(),
    listarProcesos(),
    subsanacionesAbiertas(),
  ]);
  const cuenta = (e: Estado) => ordenes.filter((o) => o.estado === e).length;

  // Documentación de la empresa por vencer o vencida: la insignia solo aparece
  // si de verdad hay algo (el color de alarma es un recurso escaso).
  const alertaDocs = alertasDocumentacion(docs);

  // TODO lo que pide atención, de las tres fuentes, para la campanita. Se
  // calcula aquí (en el layout) para que esté disponible en CUALQUIER
  // pantalla del sistema sin repetir consultas por página. El nombre de la
  // institución no se resuelve a propósito: sería una consulta más en cada
  // navegación y el código del proceso ya identifica de quién es.
  const alertas = construirAlertas({
    docs,
    ordenes,
    procesos: procesos.map((p) => ({
      id: p.id,
      codigo: p.codigo,
      estado: p.estado,
      cierre: p.cierre,
      institucion: null,
      subsanacionLimite: subsanaciones[p.id] ?? null,
    })),
  });

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
    <div className="min-h-screen">
      {/* ===== Barra de estado de alertas: encabeza TODA la app — es el
          requisito («no importa en la opción que esté en sistema»). Va en
          flujo, arriba del todo y cruzando por encima del menú. ===== */}
      <BarraAlertas alertas={alertas} />

      <div className="md:flex">
        {/* ===== Sidebar (desktop): colapsable a rail, secciones plegables ===== */}
        <Sidebar datos={datos} />

        {/* ===== Top bar (móvil): con menú completo en drawer. Se pega justo
            DEBAJO de la barra de alertas, no encima de ella. ===== */}
        <header className="sticky top-[var(--h-alertas)] z-30 flex items-center justify-between border-b border-line bg-canvas/90 px-4 py-2.5 backdrop-blur md:hidden">
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
      </div>

      {/* Buscador global (Cmd/Ctrl+K), montado una vez */}
      <BuscadorGlobal />

      {/* Avisos (toasts), montados una vez */}
      <Avisos />
    </div>
  );
}
