import Link from "next/link";
import {
  LayoutList,
  Users,
  Plus,
  Search,
  ChevronsUpDown,
  LogOut,
  Settings,
  FolderClosed,
  Check,
} from "lucide-react";
import { requireMiembro, getMembresias } from "@/lib/auth";
import { listarOrdenes } from "@/lib/queries";
import { cambiarOrg } from "@/lib/actions/org";
import { cerrarSesion } from "@/lib/actions/sesion";
import { isDemo } from "@/lib/demo";
import { ESTADO_LABEL, esViva, type Estado } from "@/lib/types";
import NavLink from "./_components/NavLink";

const ESTADOS_NAV: { key: Estado; dot: string }[] = [
  { key: "orden_recibida", dot: "bg-muted/50" },
  { key: "en_coordinacion", dot: "bg-primary" },
  { key: "entregado", dot: "bg-warn" },
  { key: "listo_facturar", dot: "bg-warn" },
  { key: "facturado", dot: "bg-ok" },
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
  const vivas = ordenes.filter((o) => esViva(o.estado)).length;

  return (
    <div className="min-h-screen md:flex">
      {/* ===== Sidebar (desktop) ===== */}
      <aside className="sticky top-0 hidden h-screen w-[216px] flex-none flex-col border-r border-line bg-canvas p-2.5 md:flex">
        {/* Selector de empresa (un usuario puede pertenecer a varias) */}
        <details className="group relative">
          <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
            <span className="grid h-6 w-6 flex-none place-items-center rounded-[11px] bg-primary text-primary-ink">
              <svg width="14" height="14" viewBox="0 0 40 40" fill="none" aria-hidden>
                <path
                  d="M12 20.5 L17.5 26 L28.5 14"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="truncate text-[13.5px] font-semibold text-ink">
              {miembro.organizacion?.nombre?.split(",")[0] ?? "Mi empresa"}
            </span>
            <ChevronsUpDown
              className="ml-auto h-3.5 w-3.5 flex-none text-muted"
              strokeWidth={2}
              aria-hidden
            />
          </summary>
          <div className="absolute left-0 right-0 z-30 mt-1 rounded-lg border border-line bg-surface p-1 shadow-raised">
            <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted">
              Tus empresas
            </p>
            {membresias.map((m) => {
              const activa = m.org_id === miembro.org_id;
              return (
                <form key={m.org_id} action={cambiarOrg.bind(null, m.org_id)}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-surface-2"
                  >
                    <span className="truncate">
                      {m.organizacion?.nombre ?? "Empresa"}
                    </span>
                    {activa && (
                      <Check
                        className="ml-auto h-3.5 w-3.5 text-primary"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                    )}
                  </button>
                </form>
              );
            })}
            <div className="my-1 border-t border-line" />
            <Link
              href="/onboarding"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Crear otra empresa
            </Link>
          </div>
        </details>

        {/* Buscador → al tablero (que tiene el filtro real) */}
        <Link
          href="/"
          className="mt-2.5 mb-1 flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-muted transition-colors hover:border-line-strong"
        >
          <Search className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Buscar órdenes…
        </Link>

        {/* Nav principal */}
        <nav className="mt-2 flex flex-col gap-px">
          <NavLink
            href="/"
            exact
            icon={<LayoutList className="h-[15px] w-[15px]" strokeWidth={2} />}
          >
            Bandeja
            <span className="ml-auto font-mono text-[11px] text-muted">
              {vivas}
            </span>
          </NavLink>
          <NavLink
            href="/documentos"
            icon={<FolderClosed className="h-[15px] w-[15px]" strokeWidth={2} />}
          >
            Documentos
          </NavLink>
          <NavLink
            href="/orden/nueva"
            icon={<Plus className="h-[15px] w-[15px]" strokeWidth={2} />}
          >
            Nueva orden
          </NavLink>
          <NavLink
            href="/configuracion"
            icon={<Settings className="h-[15px] w-[15px]" strokeWidth={2} />}
          >
            Configuración
          </NavLink>
        </nav>

        {/* Sección Estados (filtros) */}
        <p className="mt-[18px] mb-1.5 px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Estados
        </p>
        <div className="flex flex-col gap-px">
          {ESTADOS_NAV.map((e) => (
            <Link
              key={e.key}
              href={`/?estado=${e.key}`}
              className="flex items-center gap-2.5 rounded-[11px] px-2.5 py-1.5 text-[12.5px] text-ink-soft transition-colors hover:bg-surface-2"
            >
              <span className={`h-2 w-2 flex-none rounded-full ${e.dot}`} />
              <span className="truncate">{ESTADO_LABEL[e.key]}</span>
              <span className="ml-auto font-mono text-[11px] text-muted">
                {cuenta(e.key)}
              </span>
            </Link>
          ))}
        </div>

        {/* Pie: usuario / sesión */}
        <div className="mt-auto flex items-center gap-2 border-t border-line px-2 pt-2.5">
          <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-surface-2 font-mono text-[11px] font-semibold text-ink-soft">
            {(miembro.nombre ?? "?").slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-soft">
            {miembro.nombre ?? "Usuario"}
          </span>
          {isDemo() ? (
            <span className="rounded-full bg-warn-soft px-1.5 py-0.5 font-mono text-[10px] font-medium text-warn">
              demo
            </span>
          ) : (
            <form action={cerrarSesion}>
              <button
                type="submit"
                className="text-muted transition-colors hover:text-ink"
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </form>
          )}
        </div>
      </aside>

      {/* ===== Top bar (móvil) ===== */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-canvas/90 px-4 py-2.5 backdrop-blur md:hidden">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-[11px] bg-primary text-primary-ink">
            <svg width="13" height="13" viewBox="0 0 40 40" fill="none" aria-hidden>
              <path
                d="M12 20.5 L17.5 26 L28.5 14"
                stroke="currentColor"
                strokeWidth="4.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="font-display text-sm font-semibold tracking-tight">
            adjudicado<span className="text-muted">.app</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/orden/nueva"
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[13px] font-medium text-primary-ink"
          >
            <Plus className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            Nueva
          </Link>
          <Link href="/configuracion/equipo" className="text-muted" aria-label="Equipo">
            <Users className="h-5 w-5" strokeWidth={2} aria-hidden />
          </Link>
        </div>
      </header>

      {/* ===== Contenido ===== */}
      <main className="min-w-0 flex-1">
        <div className="max-w-[1180px] px-4 py-6 sm:px-6 lg:px-10">
          {children}
        </div>
      </main>
    </div>
  );
}
