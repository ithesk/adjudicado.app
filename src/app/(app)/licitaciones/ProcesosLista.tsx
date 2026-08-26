"use client";

// La lista de licitaciones como TABLA INTELIGENTE (patrón del catálogo de
// entidades): buscador tolerante (mayúsculas/acentos/faltas dan igual),
// filtros por etapa con conteos, orden por columna, y la entidad visible
// en cada fila. El reloj de una subsanación abierta manda sobre el cierre.
//
// La tabla es `table-fixed` A PROPÓSITO, y no es cosmético: con el layout
// automático del navegador, `truncate` NO puede encoger una celda —
// white-space:nowrap hace que el ancho mínimo de la celda sea el texto
// ENTERO, y overflow:hidden solo recorta al pintar, no reduce ese mínimo.
// Un objeto de pliego largo (los hay de 130 caracteres) ensanchaba la tabla
// por encima de su contenedor y empujaba Estado y las acciones fuera de la
// pantalla. Con `table-fixed` el ancho lo manda la cabecera y el contenido
// ya no vota, así que desbordar es imposible.
//
// Por debajo de lg la tabla se convierte en TARJETAS: cinco columnas no
// caben en 375px con ninguna técnica, y el scroll horizontal era justo la
// queja. Apiladas, no hay nada que se pueda salir de la pantalla.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronsUpDown,
  Columns3,
  FolderOpen,
  MoreHorizontal,
  Rows3,
  Search,
} from "lucide-react";
import { diasRestantes, nivelUrgencia, type NivelUrgencia } from "@/lib/types";
import { urgenciaChip, urgenciaDot, textoDias } from "@/lib/ui";
import { btnGhost } from "@/components/ui";
import { coincideTexto } from "@/lib/buscar-texto";
import { avisoError, avisoOk } from "@/lib/avisos";
import { actualizarProcesoAction } from "@/lib/actions/licitaciones";
import DuplicarProceso from "./_components/DuplicarProceso";
import TableroLicitaciones from "./_components/TableroLicitaciones";
import {
  ESTADO_LIC_CHIP,
  ESTADO_LIC_LABEL,
  ESTADOS_LICITACION,
  MODALIDAD_LABEL,
  type EstadoLicitacion,
  type LicProceso,
} from "@/lib/licitaciones/tipos";

// El cierre es fecha+hora; el contador de días reusa los helpers del tablero.
function diasAlCierre(cierre: string | null): number | null {
  return diasRestantes(cierre ? cierre.slice(0, 10) : null);
}

const VIVO: Record<string, boolean> = {
  captura: true,
  calificacion: true,
  costeo: true,
  armado: true,
  listo: true,
  sometido: true,
  subsanacion: true,
};

// Filtros por etapa del ciclo (con conteo, estilo Odoo).
const FILTROS: { key: string; label: string; estados: EstadoLicitacion[] | null }[] = [
  { key: "todas", label: "Todas", estados: null },
  { key: "trabajo", label: "En trabajo", estados: ["captura", "calificacion", "costeo", "armado", "listo"] },
  { key: "sometidas", label: "Sometidas", estados: ["sometido", "subsanacion"] },
  { key: "ganadas", label: "Adjudicadas", estados: ["adjudicado"] },
  { key: "cerradas", label: "Perdidas y descartadas", estados: ["perdido", "descartado"] },
];

type Orden = { col: "cierre" | "codigo" | "estado"; asc: boolean };

const LS_VISTA = "licitaciones-vista";

interface EntidadMini {
  nombre: string;
  siglas: string | null;
}

// El fondo va en cada th (no en el tr) para que el redondeo de las esquinas
// superiores recorte de verdad.
const TH = "bg-surface-2 px-3 py-2 font-medium";

// Qué etapas ofrece el menú de la fila. Solo las de TRABAJO TEMPRANO, más la
// salida de higiene: «Listo» y «Sometido» se dejan fuera a propósito — ahí
// hay que ver el gate de requisitos críticos y los totales antes de mover, y
// eso solo se ve dentro del expediente.
const ETAPAS_EN_MENU: EstadoLicitacion[] = ["calificacion", "costeo", "armado"];

function siguientesEstados(estado: EstadoLicitacion): EstadoLicitacion[] {
  const i = ESTADOS_LICITACION.indexOf(estado);
  const siguiente = ESTADOS_LICITACION[i + 1];
  const opciones: EstadoLicitacion[] = [];
  if (siguiente && ETAPAS_EN_MENU.includes(siguiente)) opciones.push(siguiente);
  if (estado !== "descartado" && estado !== "adjudicado") opciones.push("descartado");
  return opciones;
}

// Cabecera ordenable. Definida FUERA del padre (regla de la casa). El doble
// chevrón apagado anuncia que la columna se puede ordenar aunque no sea la
// activa: antes solo se sabía después de hacer clic.
function Cabecera({
  col,
  orden,
  onOrdenar,
  children,
}: {
  col: Orden["col"];
  orden: Orden;
  onOrdenar: (col: Orden["col"]) => void;
  children: React.ReactNode;
}) {
  const activa = orden.col === col;
  const Flecha = orden.asc ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onOrdenar(col)}
      className={`inline-flex max-w-full items-center gap-1 rounded-sm font-medium uppercase tracking-[0.1em] transition-colors hover:text-ink ${activa ? "text-ink" : ""}`}
      title="Ordenar por esta columna"
    >
      <span className="truncate">{children}</span>
      {activa ? (
        <Flecha className="h-3 w-3 shrink-0" strokeWidth={2.2} aria-hidden />
      ) : (
        <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" strokeWidth={2} aria-hidden />
      )}
    </button>
  );
}

// ===== Piezas compartidas por la tabla y las tarjetas =====
// Definirlas una vez evita que las dos presentaciones se desincronicen.

function ChipCierre({
  dias,
  nivel,
  esSub,
}: {
  dias: number | null;
  nivel: NivelUrgencia;
  esSub: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className={`h-2 w-2 shrink-0 rounded-full ${urgenciaDot(nivel)}`} aria-hidden />
      <span
        className={`rounded px-1.5 py-0.5 font-mono text-xs font-medium ${urgenciaChip(nivel)}`}
        title={esSub ? "Fecha límite de la subsanación abierta" : "Cierre del proceso"}
      >
        {textoDias(dias)}
      </span>
    </span>
  );
}

function ChipEstado({ estado }: { estado: EstadoLicitacion }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${ESTADO_LIC_CHIP[estado].chip}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${ESTADO_LIC_CHIP[estado].dot}`}
        aria-hidden
      />
      {ESTADO_LIC_LABEL[estado]}
    </span>
  );
}

// Identidad del proceso: código + sigla de modalidad + objeto. La modalidad
// va como SIGLA («CM», «CP», «LPN») en vez de una columna de 150px con
// «Licitación pública nacional»: es el vocabulario del negocio, ocupa lo que
// una palabra, y ahora se ve en TODOS los tamaños (la columna desaparecía
// por debajo de md, justo donde más falta hacía).
function Identidad({
  p,
  ent,
  sub,
  conEntidad,
}: {
  p: LicProceso;
  ent: EntidadMini | null;
  sub: string | null;
  conEntidad: boolean;
}) {
  return (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 truncate font-mono text-[12.5px] font-medium text-ink">
          {p.codigo}
        </span>
        <span
          className="max-w-[72px] shrink-0 truncate rounded bg-surface-2 px-1 py-px font-mono text-[10px] font-medium uppercase text-muted"
          title={MODALIDAD_LABEL[p.modalidad] ?? p.modalidad}
        >
          {p.modalidad}
        </span>
        {/* El chip de subsanación vive aquí y no en la columna Cierre: allí
            su ancho se sumaba al del chip de días y reventaba los 140px. */}
        {sub && (
          <span className="shrink-0 rounded bg-warn-soft px-1 py-px text-[10px] font-semibold uppercase text-warn">
            Subsana
          </span>
        )}
      </span>
      <span className="mt-0.5 block truncate text-[12.5px] text-muted" title={p.objeto ?? undefined}>
        {conEntidad && ent ? `${ent.siglas ?? ent.nombre} · ` : ""}
        {p.objeto ?? "Sin objeto"}
      </span>
    </>
  );
}

// El menú «⋯» de cada fila. Antes la única acción era un icono de copiar
// suelto que, encima, se salía de la pantalla por el desbordamiento.
//
// NO lleva «Eliminar» a propósito: hoy no existe ninguna UI de borrado en
// toda la app, y borrar un proceso arrastra en cascada sus ítems y
// requisitos. Estrenar esa capacidad detrás de un clic en un desplegable
// sería regalar una forma fácil de perder trabajo.
function AccionesFila({
  proceso,
  className = "",
}: {
  proceso: LicProceso;
  className?: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDetailsElement>(null);
  const [ocupado, setOcupado] = useState(false);

  // <details> no se cierra solo al clicar fuera ni con Escape, y un menú
  // abierto encima de la tabla estorba más de lo que ayuda.
  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) {
        ref.current.open = false;
      }
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.open) ref.current.open = false;
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  function cerrar() {
    if (ref.current) ref.current.open = false;
  }

  async function mover(estado: EstadoLicitacion) {
    setOcupado(true);
    const error = await actualizarProcesoAction(proceso.id, { estado });
    setOcupado(false);
    if (error) {
      avisoError(error);
    } else {
      avisoOk(`${proceso.codigo} → ${ESTADO_LIC_LABEL[estado]}.`);
      router.refresh();
    }
    cerrar();
  }

  const item =
    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-surface-2 disabled:opacity-55";
  const etapas = siguientesEstados(proceso.estado);

  return (
    <details ref={ref} className={`relative ${className}`}>
      <summary
        className="grid h-8 w-8 cursor-pointer touch-manipulation list-none place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink [&::-webkit-details-marker]:hidden"
        aria-label={`Opciones de ${proceso.codigo}`}
        title="Opciones"
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={2.2} aria-hidden />
      </summary>

      <div className="absolute right-0 z-30 mt-1 w-56 rounded-md border border-line bg-surface p-1 text-left shadow-raised">
        <Link
          href={`/licitaciones/${proceso.id}`}
          prefetch={false}
          className={item}
          onClick={cerrar}
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={2} aria-hidden />
          Abrir el expediente
        </Link>

        {etapas.length > 0 && (
          <>
            <p className="px-2 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted">
              Mover a
            </p>
            {etapas.map((e) => (
              <button
                key={e}
                type="button"
                disabled={ocupado}
                onClick={() => mover(e)}
                className={item}
              >
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={2} aria-hidden />
                {ESTADO_LIC_LABEL[e]}
              </button>
            ))}
          </>
        )}

        <div className="my-1 border-t border-line" />
        <DuplicarProceso
          procesoId={proceso.id}
          codigoActual={proceso.codigo}
          variante="menu"
          onAbrir={cerrar}
        />
      </div>
    </details>
  );
}

export default function ProcesosLista({
  procesos,
  subsanaciones = {},
  entidades = {},
}: {
  procesos: LicProceso[];
  // proceso_id → fecha límite de su subsanación ABIERTA: ese reloj manda.
  subsanaciones?: Record<string, string>;
  entidades?: Record<string, EntidadMini>;
}) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [orden, setOrden] = useState<Orden>({ col: "cierre", asc: true });
  // Tabla o tablero. La preferencia se recuerda; se lee tras montar para no
  // desajustar la hidratación (el servidor siempre pinta la tabla), igual
  // que hace el sidebar con su rail.
  const [vista, setVista] = useState<"tabla" | "tablero">("tabla");
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(LS_VISTA) === "tablero") setVista("tablero");
    } catch {}
  }, []);

  function cambiarVista(v: "tabla" | "tablero") {
    setVista(v);
    try {
      localStorage.setItem(LS_VISTA, v);
    } catch {}
  }

  const conteos = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of FILTROS) {
      m.set(
        f.key,
        f.estados === null
          ? procesos.length
          : procesos.filter((p) => f.estados!.includes(p.estado)).length,
      );
    }
    return m;
  }, [procesos]);

  // Solo el BUSCADOR, sin el filtro por etapa: es lo que alimenta el tablero,
  // donde las columnas YA son las etapas y filtrar por etapa lo dejaría medio
  // vacío sin motivo.
  const buscados = useMemo(() => {
    if (!q.trim()) return procesos;
    return procesos.filter((p) => {
      const ent = p.institucion_id ? entidades[p.institucion_id] : null;
      return coincideTexto(
        `${p.codigo} ${p.objeto ?? ""} ${ent?.nombre ?? ""} ${ent?.siglas ?? ""} ${MODALIDAD_LABEL[p.modalidad] ?? p.modalidad} ${ESTADO_LIC_LABEL[p.estado]}`,
        q,
      );
    });
  }, [procesos, q, entidades]);

  const filtrados = useMemo(() => {
    const estadosDelFiltro = FILTROS.find((f) => f.key === filtro)?.estados ?? null;
    const lista = estadosDelFiltro
      ? buscados.filter((p) => estadosDelFiltro.includes(p.estado))
      : [...buscados];

    const dir = orden.asc ? 1 : -1;
    lista.sort((a, b) => {
      if (orden.col === "codigo") return dir * a.codigo.localeCompare(b.codigo);
      if (orden.col === "estado")
        return (
          dir *
          (ESTADOS_LICITACION.indexOf(a.estado) - ESTADOS_LICITACION.indexOf(b.estado))
        );
      // cierre: manda el reloj vivo (subsanación primero); sin fecha, al final.
      const da = subsanaciones[a.id]
        ? diasAlCierre(subsanaciones[a.id])
        : VIVO[a.estado]
          ? diasAlCierre(a.cierre)
          : null;
      const db = subsanaciones[b.id]
        ? diasAlCierre(subsanaciones[b.id])
        : VIVO[b.estado]
          ? diasAlCierre(b.cierre)
          : null;
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return dir * (da - db);
    });
    return lista;
  }, [buscados, filtro, orden, subsanaciones]);

  function ordenarPor(col: Orden["col"]) {
    setOrden((prev) =>
      prev.col === col ? { col, asc: !prev.asc } : { col, asc: true },
    );
  }

  // Los datos de cada fila, calculados una vez y usados por las dos vistas.
  const filas = filtrados.map((p) => {
    const sub = subsanaciones[p.id] ?? null;
    const dias = sub ? diasAlCierre(sub) : VIVO[p.estado] ? diasAlCierre(p.cierre) : null;
    return {
      p,
      sub,
      dias,
      nivel: nivelUrgencia(dias),
      ent: p.institucion_id ? entidades[p.institucion_id] ?? null : null,
      conReloj: Boolean(sub) || Boolean(VIVO[p.estado]),
    };
  });

  if (procesos.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
        Crea el primer proceso con «Nuevo proceso»: código del expediente,
        entidad y fecha de cierre. Los ítems y requisitos se cargan después.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Buscador + filtros por etapa */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative block min-w-64 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            strokeWidth={2}
            aria-hidden
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por código, objeto, entidad, modalidad o estado…"
            className="w-full rounded-md border border-line bg-surface py-2 pl-9 pr-16 text-sm text-ink shadow-card outline-none transition-colors placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-[var(--ring)]"
          />
          {q && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-muted">
              {filtrados.length}/{procesos.length}
            </span>
          )}
        </label>
        {/* Los filtros por etapa solo tienen sentido en la tabla: en el
            tablero, las columnas YA son las etapas. */}
        {vista === "tabla" && (
          <div className="flex flex-wrap gap-1">
            {FILTROS.map((f) => {
              const nf = conteos.get(f.key) ?? 0;
              if (f.key !== "todas" && nf === 0) return null;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFiltro(f.key)}
                  className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-[12.5px] font-medium transition-colors ${
                    filtro === f.key
                      ? "bg-surface-2 text-ink"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {f.label}
                  <span className="font-mono text-[10.5px] text-muted">{nf}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Tabla ↔ tablero. Dos preguntas distintas sobre los mismos datos:
            la tabla dice qué corre prisa; el tablero, cómo va el embudo. */}
        <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-line bg-surface p-0.5">
          {([
            ["tabla", "Tabla", Rows3],
            ["tablero", "Tablero", Columns3],
          ] as const).map(([v, label, Icono]) => (
            <button
              key={v}
              type="button"
              onClick={() => cambiarVista(v)}
              aria-pressed={vista === v}
              title={
                v === "tabla"
                  ? "Ver como tabla ordenable"
                  : "Ver como tablero por etapa — arrastra una tarjeta para avanzarla"
              }
              className={`flex items-center gap-1.5 rounded px-2 py-1 text-[12.5px] font-medium transition-colors ${
                vista === v ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"
              }`}
            >
              <Icono className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
              <span className="max-sm:sr-only">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {vista === "tablero" ? (
        <TableroLicitaciones
          procesos={buscados}
          subsanaciones={subsanaciones}
          entidades={entidades}
        />
      ) : filtrados.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center">
          <p className="text-sm text-muted">
            Nada coincide{q ? ` con “${q}”` : ""}
            {filtro !== "todas"
              ? ` en «${FILTROS.find((f) => f.key === filtro)?.label}»`
              : ""}
            .
          </p>
          {(q || filtro !== "todas") && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setFiltro("todas");
              }}
              className={btnGhost("mt-3 !px-2.5 !py-1.5 !text-[12.5px]")}
            >
              Quitar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          {/* ===== Tabla — desde lg. Sin overflow-x: con table-fixed no puede
              desbordar, y sin él el menú «⋯» puede salirse de la fila. Una
              sola columna sin ancho declarado (Proceso) se queda con TODA la
              holgura: reparto determinista en cualquier navegador. ===== */}
          <div className="hidden rounded-lg border border-line bg-surface shadow-card lg:block">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  <th
                    scope="col"
                    className={`${TH} w-[140px] rounded-tl-lg`}
                    aria-sort={orden.col === "cierre" ? (orden.asc ? "ascending" : "descending") : "none"}
                  >
                    <Cabecera col="cierre" orden={orden} onOrdenar={ordenarPor}>Cierre</Cabecera>
                  </th>
                  <th
                    scope="col"
                    className={TH}
                    aria-sort={orden.col === "codigo" ? (orden.asc ? "ascending" : "descending") : "none"}
                  >
                    <Cabecera col="codigo" orden={orden} onOrdenar={ordenarPor}>Proceso</Cabecera>
                  </th>
                  <th scope="col" className={`${TH} hidden w-[180px] xl:table-cell`}>
                    Entidad
                  </th>
                  <th
                    scope="col"
                    className={`${TH} w-[148px]`}
                    aria-sort={orden.col === "estado" ? (orden.asc ? "ascending" : "descending") : "none"}
                  >
                    <Cabecera col="estado" orden={orden} onOrdenar={ordenarPor}>Estado</Cabecera>
                  </th>
                  <th scope="col" className={`${TH} w-[56px] rounded-tr-lg`}>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map(({ p, sub, dias, nivel, ent, conReloj }) => (
                  <tr
                    key={p.id}
                    className="border-b border-line transition-colors last:border-0 hover:bg-surface-2 focus-within:bg-surface-2"
                  >
                    <td className="px-3 py-2.5 align-middle">
                      {conReloj ? (
                        <ChipCierre dias={dias} nivel={nivel} esSub={Boolean(sub)} />
                      ) : (
                        <span className="pl-3.5 text-muted">—</span>
                      )}
                    </td>

                    <td className="px-3 py-2.5 align-middle">
                      <Link
                        href={`/licitaciones/${p.id}`}
                        prefetch={false}
                        className="block min-w-0 rounded-sm"
                      >
                        {/* La entidad viaja dentro del objeto solo mientras
                            no tenga columna propia (por debajo de xl). */}
                        <span className="xl:hidden">
                          <Identidad p={p} ent={ent} sub={sub} conEntidad />
                        </span>
                        <span className="hidden xl:block">
                          <Identidad p={p} ent={ent} sub={sub} conEntidad={false} />
                        </span>
                      </Link>
                    </td>

                    <td className="hidden px-3 py-2.5 align-middle xl:table-cell">
                      <span
                        className="block truncate text-[12.5px] text-ink-soft"
                        title={ent?.nombre ?? undefined}
                      >
                        {ent ? ent.siglas ?? ent.nombre : "—"}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 align-middle">
                      <ChipEstado estado={p.estado} />
                    </td>

                    <td className="px-2 py-2.5 align-middle">
                      <AccionesFila proceso={p} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ===== Tarjetas — por debajo de lg. Cinco columnas no caben en
              375px con ninguna técnica; apiladas, nada puede salirse de la
              pantalla. Plazo y estado arriba, que es lo que se mira. ===== */}
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface shadow-card lg:hidden">
            {filas.map(({ p, sub, dias, nivel, ent, conReloj }) => (
              <li
                key={p.id}
                className="flex items-start gap-1 transition-colors hover:bg-surface-2 focus-within:bg-surface-2"
              >
                <Link
                  href={`/licitaciones/${p.id}`}
                  prefetch={false}
                  className="block min-w-0 flex-1 px-3 py-3"
                >
                  <span className="flex items-center justify-between gap-2">
                    {conReloj ? (
                      <ChipCierre dias={dias} nivel={nivel} esSub={Boolean(sub)} />
                    ) : (
                      <span className="text-xs text-muted">Sin plazo</span>
                    )}
                    <ChipEstado estado={p.estado} />
                  </span>
                  <span className="mt-1.5 block min-w-0">
                    <Identidad p={p} ent={ent} sub={sub} conEntidad />
                  </span>
                </Link>
                <AccionesFila proceso={p} className="my-2 mr-1 shrink-0" />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
