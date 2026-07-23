"use client";

// El sidebar de la app, al estilo de las mejores tools (Linear/Notion):
// - colapsable a un RAIL de iconos (más espacio para las tablas anchas),
//   con tooltips y preferencia recordada;
// - la sección "Estados" se pliega/expande y se recuerda;
// - Configuración y Equipo visibles al pie (no enterrados en un menú);
// - en móvil, el menú completo vive en un drawer (antes no existía).
// La línea gráfica no cambia: mismos tokens, mismos colores.

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Activity,
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronsUpDown,
  FolderClosed,
  Gavel,
  Landmark,
  LayoutList,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Tags,
  Users,
  X,
} from "lucide-react";
import { cambiarOrg } from "@/lib/actions/org";
import { cerrarSesion } from "@/lib/actions/sesion";
import { BotonBuscar } from "./BuscadorGlobal";
import { LogoMarca } from "@/components/Logo";

const LS_RAIL = "sidebar-rail";
const LS_ESTADOS = "sidebar-estados-abierto";

export interface DatosSidebar {
  orgNombre: string;
  orgActiva: string;
  membresias: { org_id: string; nombre: string }[];
  nombreUsuario: string;
  demo: boolean;
  vivas: number;
  estados: { key: string; dot: string; label: string; cuenta: number }[];
  alertaDocs: { total: number; urgente: boolean };
}

const DESTINOS = [
  { href: "/", exact: true, label: "Bandeja", Icono: LayoutList },
  { href: "/actividad", label: "Bitácora general", Icono: Activity },
  { href: "/documentos", label: "Documentos", Icono: FolderClosed },
  { href: "/precios", label: "Precios", Icono: Tags },
  { href: "/licitaciones", label: "Licitaciones", Icono: Gavel },
  { href: "/entidades", label: "Entidades", Icono: Landmark },
  { href: "/configuracion/empresa", label: "Empresa", Icono: BadgeCheck },
] as const;

function ItemNav({
  href,
  exact,
  label,
  Icono,
  rail,
  tactil = false,
  extra,
  onNavegar,
}: {
  href: string;
  exact?: boolean;
  label: string;
  Icono: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  rail: boolean;
  // En el drawer móvil las filas crecen a ~44px (objetivo táctil); el
  // sidebar desktop conserva su densidad.
  tactil?: boolean;
  extra?: React.ReactNode;
  onNavegar?: () => void;
}) {
  const pathname = usePathname();
  const activo = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      title={rail ? label : undefined}
      onClick={onNavegar}
      className={`flex items-center gap-2.5 rounded-[11px] px-2.5 text-[13px] transition-colors ${
        tactil ? "py-2.5" : "py-1.5"
      } ${rail ? "justify-center px-0 py-2" : ""} ${
        activo
          ? "bg-primary/10 font-semibold text-primary"
          : "text-ink-soft hover:bg-surface-2"
      }`}
    >
      <Icono className="h-[15px] w-[15px] flex-none" strokeWidth={2} />
      {!rail && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!rail && extra}
    </Link>
  );
}

// El cuerpo de navegación compartido entre el sidebar y el drawer móvil.
function CuerpoNav({
  datos,
  rail,
  tactil = false,
  estadosAbierto,
  onToggleEstados,
  onNavegar,
}: {
  datos: DatosSidebar;
  rail: boolean;
  tactil?: boolean;
  estadosAbierto: boolean;
  onToggleEstados: () => void;
  onNavegar?: () => void;
}) {
  const totalEstados = datos.estados.reduce((s, e) => s + e.cuenta, 0);
  return (
    <>
      <nav className="mt-2 flex flex-col gap-px">
        <ItemNav
          {...DESTINOS[0]}
          rail={rail}
          tactil={tactil}
          onNavegar={onNavegar}
          extra={
            <span className="ml-auto font-mono text-[11px] text-muted">{datos.vivas}</span>
          }
        />
        {DESTINOS.slice(1, 6).map((d) => (
          <ItemNav key={d.href} {...d} rail={rail} tactil={tactil} onNavegar={onNavegar} />
        ))}
        <ItemNav
          {...DESTINOS[6]}
          rail={rail}
          tactil={tactil}
          onNavegar={onNavegar}
          extra={
            datos.alertaDocs.total > 0 ? (
              <span
                className={`ml-auto rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                  datos.alertaDocs.urgente
                    ? "bg-danger-soft text-danger"
                    : "bg-warn-soft text-warn"
                }`}
                title="Documentos vencidos o por vencer"
              >
                {datos.alertaDocs.total}
              </span>
            ) : undefined
          }
        />
      </nav>

      {/* Estados: sección plegable (se recuerda). En el rail no cabe. */}
      {!rail && (
        <>
          <button
            type="button"
            onClick={onToggleEstados}
            aria-expanded={estadosAbierto}
            className={`mt-[18px] mb-1 flex w-full items-center gap-1.5 rounded-md px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:bg-surface-2 hover:text-ink ${tactil ? "py-2" : "py-1"}`}
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${estadosAbierto ? "" : "-rotate-90"}`}
              strokeWidth={2}
              aria-hidden
            />
            Estados
            {!estadosAbierto && (
              <span className="ml-auto font-mono text-[10.5px] normal-case tracking-normal">
                {totalEstados}
              </span>
            )}
          </button>
          {estadosAbierto && (
            <div className="flex flex-col gap-px">
              {datos.estados.map((e) => (
                <Link
                  key={e.key}
                  href={`/?estado=${e.key}`}
                  onClick={onNavegar}
                  className={`flex items-center gap-2.5 rounded-[11px] px-2.5 text-[12.5px] text-ink-soft transition-colors hover:bg-surface-2 ${tactil ? "py-2.5" : "py-1.5"}`}
                >
                  <span className={`h-2 w-2 flex-none rounded-full ${e.dot}`} />
                  <span className="truncate">{e.label}</span>
                  <span className="ml-auto font-mono text-[11px] text-muted">{e.cuenta}</span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

// La lista "Tus empresas" + crear otra — compartida entre el dropdown del
// sidebar desktop y el drawer móvil (antes el cambio de org NO existía en
// móvil: el usuario multi-empresa quedaba atrapado en la org activa).
function OpcionesOrg({ datos, tactil = false }: { datos: DatosSidebar; tactil?: boolean }) {
  const alto = tactil ? "py-2.5" : "py-1.5";
  return (
    <>
      <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted">
        Tus empresas
      </p>
      {datos.membresias.map((m) => (
        <form key={m.org_id} action={cambiarOrg.bind(null, m.org_id)}>
          <button
            type="submit"
            className={`flex w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-ink transition-colors hover:bg-surface-2 ${alto}`}
          >
            <span className="truncate">{m.nombre}</span>
            {m.org_id === datos.orgActiva && (
              <Check className="ml-auto h-3.5 w-3.5 text-primary" strokeWidth={2.5} aria-hidden />
            )}
          </button>
        </form>
      ))}
      <div className="my-1 border-t border-line" />
      <Link
        href="/onboarding"
        className={`flex items-center gap-2 rounded-md px-2 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-ink ${alto}`}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Crear otra empresa
      </Link>
    </>
  );
}

// Menú de usuario del pie (cuenta · sesión). Config y Equipo ya están a la vista.
function PieUsuario({ datos, rail }: { datos: DatosSidebar; rail: boolean }) {
  return (
    <details className="group relative border-t border-line pt-2">
      <summary
        className={`flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2 [&::-webkit-details-marker]:hidden ${
          rail ? "justify-center px-0" : ""
        }`}
        title={rail ? datos.nombreUsuario : undefined}
      >
        <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-surface-2 font-mono text-[11px] font-semibold text-ink-soft">
          {datos.nombreUsuario.slice(0, 2).toUpperCase()}
        </span>
        {!rail && (
          <>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-soft">
              {datos.nombreUsuario}
            </span>
            {datos.demo && (
              <span className="rounded-full bg-warn-soft px-1.5 py-0.5 font-mono text-[10px] font-medium text-warn">
                demo
              </span>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 flex-none text-muted" strokeWidth={2} aria-hidden />
          </>
        )}
      </summary>
      <div className="absolute bottom-full left-0 z-30 mb-1 w-52 rounded-lg border border-line bg-surface p-1 shadow-raised">
        <div className="px-2 py-1.5">
          <p className="truncate text-[12.5px] font-medium text-ink">{datos.nombreUsuario}</p>
          <p className="truncate text-[11px] text-muted">{datos.orgNombre}</p>
        </div>
        <div className="my-1 border-t border-line" />
        {datos.demo ? (
          <span className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted">
            <LogOut className="h-4 w-4" strokeWidth={2} aria-hidden />
            Sesión demo
          </span>
        ) : (
          <form action={cerrarSesion}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-surface-2"
            >
              <LogOut className="h-4 w-4 text-muted" strokeWidth={2} aria-hidden />
              Cerrar sesión
            </button>
          </form>
        )}
      </div>
    </details>
  );
}

export default function Sidebar({ datos }: { datos: DatosSidebar }) {
  const [rail, setRail] = useState(false);
  const [estadosAbierto, setEstadosAbierto] = useState(true);

  // Preferencias recordadas. Se leen tras montar para no desajustar la
  // hidratación (el servidor siempre pinta expandido); ese doble render
  // inicial es deliberado.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(LS_RAIL) === "1") setRail(true);
      if (localStorage.getItem(LS_ESTADOS) === "0") setEstadosAbierto(false);
    } catch {}
  }, []);

  function toggleRail() {
    setRail((v) => {
      try {
        localStorage.setItem(LS_RAIL, v ? "0" : "1");
      } catch {}
      return !v;
    });
  }
  function toggleEstados() {
    setEstadosAbierto((v) => {
      try {
        localStorage.setItem(LS_ESTADOS, v ? "0" : "1");
      } catch {}
      return !v;
    });
  }

  return (
    <aside
      className={`sticky top-0 hidden h-screen flex-none flex-col border-r border-line bg-canvas p-2.5 transition-[width] duration-150 md:flex ${
        rail ? "w-[60px]" : "w-[216px]"
      }`}
    >
      {/* Cabecera: empresa + colapsar */}
      {rail ? (
        <div className="flex flex-col items-center gap-1">
          <Link href="/" title={datos.orgNombre} className="rounded-lg p-1.5 transition-colors hover:bg-surface-2">
            <LogoMarca size={22} className="text-ink" />
          </Link>
          <button
            type="button"
            onClick={toggleRail}
            title="Expandir el menú"
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <PanelLeftOpen className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <details className="group relative min-w-0 flex-1">
            <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
              <LogoMarca size={22} className="flex-none text-ink" />
              <span className="truncate text-[13.5px] font-semibold text-ink">
                {datos.orgNombre.split(",")[0]}
              </span>
              <ChevronsUpDown className="ml-auto h-3.5 w-3.5 flex-none text-muted" strokeWidth={2} aria-hidden />
            </summary>
            <div className="absolute left-0 right-0 z-30 mt-1 rounded-lg border border-line bg-surface p-1 shadow-raised">
              <OpcionesOrg datos={datos} />
            </div>
          </details>
          <button
            type="button"
            onClick={toggleRail}
            title="Colapsar el menú (más espacio para las tablas)"
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <PanelLeftClose className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
      )}

      {/* Acción primaria */}
      <Link
        href="/orden/nueva"
        title={rail ? "Nueva orden" : undefined}
        className={`mt-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-[13px] font-semibold text-primary-ink shadow-card transition-colors hover:bg-primary-hover ${
          rail ? "px-0" : "px-2.5"
        }`}
      >
        <Plus className="h-4 w-4 flex-none" strokeWidth={2.4} aria-hidden />
        {!rail && "Nueva orden"}
      </Link>

      {/* Buscador global (Cmd/Ctrl+K) */}
      <BotonBuscar
        className={`mt-1.5 mb-1 flex w-full items-center gap-2 rounded-lg border border-line bg-surface py-1.5 text-[12.5px] text-muted transition-colors hover:border-line-strong ${
          rail ? "justify-center px-0" : "px-2.5"
        }`}
      >
        <Search className="h-3.5 w-3.5 flex-none" strokeWidth={2} aria-hidden />
        {!rail && (
          <>
            Buscar en todo…
            <kbd className="ml-auto rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">
              ⌘K
            </kbd>
          </>
        )}
      </BotonBuscar>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <CuerpoNav
          datos={datos}
          rail={rail}
          estadosAbierto={estadosAbierto}
          onToggleEstados={toggleEstados}
        />
      </div>

      {/* Pie: Configuración y Equipo A LA VISTA, luego el usuario. */}
      <div className="flex flex-col gap-px pt-1.5">
        <ItemNav href="/configuracion/equipo" label="Equipo" Icono={Users} rail={rail} />
        <ItemNav href="/configuracion" exact label="Configuración" Icono={Settings} rail={rail} />
      </div>
      <div className="mt-1.5">
        <PieUsuario datos={datos} rail={rail} />
      </div>
    </aside>
  );
}

// ===== Menú móvil (drawer): antes la navegación no existía en móvil. =====
export function MenuMovil({ datos }: { datos: DatosSidebar }) {
  const [abierto, setAbierto] = useState(false);
  // Estados plegable DE VERDAD también en el drawer (antes el chevrón era
  // un control muerto: onToggle era un no-op).
  const [estadosAbierto, setEstadosAbierto] = useState(true);
  const cerrar = () => setAbierto(false);

  // Con el drawer abierto: Escape cierra y el fondo NO scrollea.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("keydown", alTeclear);
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = previo;
    };
  }, [abierto]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="grid h-10 w-10 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        aria-label="Abrir el menú"
      >
        <Menu className="h-5 w-5" strokeWidth={2} aria-hidden />
      </button>
      {abierto && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Cerrar el menú"
            onClick={cerrar}
            className="absolute inset-0 bg-black/30"
          />
          <div className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col overflow-y-auto border-r border-line bg-canvas p-3 shadow-raised animate-slide-in-left">
            <div className="flex items-center justify-between">
              {/* La empresa activa ES el selector (igual que en desktop):
                  tocar el nombre despliega "Tus empresas" en línea. */}
              <details className="group min-w-0 flex-1">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-1 py-1.5 text-[13.5px] font-semibold text-ink transition-colors hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                  <LogoMarca size={22} className="flex-none text-ink" />
                  <span className="min-w-0 truncate">{datos.orgNombre.split(",")[0]}</span>
                  <ChevronsUpDown className="h-3.5 w-3.5 flex-none text-muted" strokeWidth={2} aria-hidden />
                </summary>
                <div className="mt-1 rounded-lg border border-line bg-surface p-1">
                  <OpcionesOrg datos={datos} tactil />
                </div>
              </details>
              <button
                type="button"
                onClick={cerrar}
                className="grid h-10 w-10 flex-none place-items-center rounded-md text-muted transition-colors hover:bg-surface-2"
                aria-label="Cerrar"
              >
                <X className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
              </button>
            </div>
            <CuerpoNav
              datos={datos}
              rail={false}
              tactil
              estadosAbierto={estadosAbierto}
              onToggleEstados={() => setEstadosAbierto((v) => !v)}
              onNavegar={cerrar}
            />
            <div className="mt-auto flex flex-col gap-px border-t border-line pt-2">
              <ItemNav href="/configuracion/equipo" label="Equipo" Icono={Users} rail={false} tactil onNavegar={cerrar} />
              <ItemNav href="/configuracion" exact label="Configuración" Icono={Settings} rail={false} tactil onNavegar={cerrar} />
            </div>
            {/* Cuenta y CERRAR SESIÓN — antes no existían en móvil. */}
            <div className="mt-1.5">
              <PieUsuario datos={datos} rail={false} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
