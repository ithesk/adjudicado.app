"use client";

// El checklist de requisitos. En vez de teclear requisito por requisito, se
// marca sobre el CHECKLIST ESTÁNDAR de un pliego SNCC (Sobre A legal/
// financiera/técnica, Sobre B económica) lo que este pliego pide, y se
// agregan de un golpe. Lo que la empresa ya tiene vigente en Configuración →
// Empresa nace enlazado y listo. El flag subsanable/NO subsanable manda.

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FileWarning,
  ListPlus,
  Paperclip,
  Plus,
  Trash2,
} from "lucide-react";
import { Panel, SectionTitle, btnPrimary, btnGhost } from "@/components/ui";
import VisorDocumento from "@/components/VisorDocumento";
import {
  actualizarRequisitoAction,
  crearRequisitoAction,
  crearRequisitosLoteAction,
  eliminarRequisitoAction,
  subirArchivoRequisitoAction,
  toggleRequisitoSubsanacionAction,
} from "@/lib/actions/licitaciones";
import {
  ROL_FIRMANTE_LABEL,
  type LicRequisito,
} from "@/lib/licitaciones/tipos";
import {
  GRUPO_LABEL,
  REQUISITOS_ESTANDAR,
  grupoDeRequisito,
  requisitoEstandar,
  type GrupoRequisito,
} from "@/lib/licitaciones/requisitos-estandar";

const inputSm =
  "rounded-md border border-line bg-surface px-2 py-1 text-[12.5px] text-ink outline-none focus:border-primary";

const FIRMANTES = [
  ["gerente_general", ROL_FIRMANTE_LABEL.gerente_general],
  ["gerente_ventas", ROL_FIRMANTE_LABEL.gerente_ventas],
  ["ninguno", "Nadie firma"],
] as const;

const ORDEN_GRUPOS: (GrupoRequisito | "otros")[] = [
  "legal",
  "financiera",
  "tecnica",
  "economica",
  "otros",
];

export default function RequisitosPanel({
  procesoId,
  requisitos,
  plantillasOrg = [],
  subsanacionId = null,
}: {
  procesoId: string;
  requisitos: LicRequisito[];
  plantillasOrg?: {
    codigo: string;
    nombre: string;
    preguntas: { clave: string; etiqueta: string }[];
  }[];
  // Con una subsanación ABIERTA, cada fila puede marcarse como "pedido".
  subsanacionId?: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState<"lista" | "checklist" | "manual">("lista");
  const [pendiente, startTransition] = useTransition();

  function correr(fn: () => Promise<string | null>) {
    setError(null);
    startTransition(async () => {
      const err = await fn();
      if (err) setError(err);
      router.refresh();
    });
  }

  // Agrupar las filas existentes por su grupo del catálogo estándar.
  const grupos = useMemo(() => {
    const m = new Map<string, LicRequisito[]>();
    for (const r of requisitos) {
      const g = grupoDeRequisito(r.codigo);
      m.set(g, [...(m.get(g) ?? []), r]);
    }
    return ORDEN_GRUPOS.filter((g) => (m.get(g) ?? []).length > 0).map((g) => ({
      grupo: g,
      label: g === "otros" ? "Otros requisitos" : GRUPO_LABEL[g],
      filas: m.get(g)!,
    }));
  }, [requisitos]);

  return (
    <Panel>
      <SectionTitle
        icon={FileWarning}
        right={
          <span className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setModo(modo === "checklist" ? "lista" : "checklist")}
              className={btnPrimary("!px-2.5 !py-1 !text-[12.5px]")}
            >
              <ListPlus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
              Checklist
            </button>
            <button
              type="button"
              onClick={() => setModo(modo === "manual" ? "lista" : "manual")}
              className={btnGhost("!px-2.5 !py-1 !text-[12.5px]")}
              title="Agregar un requisito que no está en el checklist estándar"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
            </button>
          </span>
        }
      >
        Requisitos ({requisitos.length})
      </SectionTitle>

      {error && (
        <p className="mx-4 mt-3 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      )}

      {modo === "checklist" && (
        <ChecklistPicker
          yaEstan={new Set(requisitos.map((r) => r.codigo))}
          plantillasOrg={plantillasOrg}
          pendiente={pendiente}
          onAgregar={(codigos) => {
            correr(() => crearRequisitosLoteAction(procesoId, codigos));
            setModo("lista");
          }}
        />
      )}

      {modo === "manual" && (
        <FormManual
          pendiente={pendiente}
          onAgregar={(datos) => {
            correr(() => crearRequisitoAction(procesoId, datos));
            setModo("lista");
          }}
        />
      )}

      {grupos.map(({ grupo, label, filas }) => (
        <div key={grupo}>
          <p className="border-b border-line bg-surface-2 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            {label}
          </p>
          <ul className="divide-y divide-line">
            {filas.map((r) => (
              <FilaRequisito
                key={r.id}
                r={r}
                preguntas={plantillasOrg.find((p) => p.codigo === r.codigo)?.preguntas ?? []}
                pendiente={pendiente}
                subsanacionId={subsanacionId}
                onToggleSub={(marcar) =>
                  correr(() =>
                    toggleRequisitoSubsanacionAction(r.id, marcar ? subsanacionId : null),
                  )
                }
                onPatch={(patch) => correr(() => actualizarRequisitoAction(r.id, patch))}
                onSubir={(fd) => correr(() => subirArchivoRequisitoAction(r.id, fd))}
                onEliminar={() => {
                  if (confirm(`¿Eliminar el requisito ${r.codigo}?`))
                    correr(() => eliminarRequisitoAction(r.id));
                }}
              />
            ))}
          </ul>
        </div>
      ))}

      {requisitos.length === 0 && modo === "lista" && (
        <div className="px-4 py-8 text-center">
          <p className="mb-3 text-sm text-muted">
            Carga los requisitos del pliego marcándolos sobre el checklist
            estándar SNCC — lo que ya tienes vigente en Empresa nace listo.
          </p>
          <button
            type="button"
            onClick={() => setModo("checklist")}
            className={btnPrimary()}
          >
            <ListPlus className="h-4 w-4" strokeWidth={2.4} aria-hidden />
            Cargar checklist estándar
          </button>
        </div>
      )}
    </Panel>
  );
}

// El picker: los requisitos estándar agrupados, marcados por defecto salvo
// los "si aplica". Un clic y entran todos.
function ChecklistPicker({
  yaEstan,
  plantillasOrg,
  pendiente,
  onAgregar,
}: {
  yaEstan: Set<string>;
  plantillasOrg: { codigo: string; nombre: string }[];
  pendiente: boolean;
  onAgregar: (codigos: string[]) => void;
}) {
  const [marcados, setMarcados] = useState<Set<string>>(
    () =>
      new Set(
        REQUISITOS_ESTANDAR.filter((r) => !r.opcional && !yaEstan.has(r.codigo)).map(
          (r) => r.codigo,
        ),
      ),
  );

  function toggle(codigo: string) {
    setMarcados((prev) => {
      const s = new Set(prev);
      if (s.has(codigo)) s.delete(codigo);
      else s.add(codigo);
      return s;
    });
  }

  const disponibles = REQUISITOS_ESTANDAR.filter((r) => !yaEstan.has(r.codigo));

  return (
    <div className="border-b border-line bg-surface-2/50 p-3">
      {ORDEN_GRUPOS.filter((g) => g !== "otros").map((g) => {
        const items = disponibles.filter((r) => r.grupo === g);
        if (items.length === 0) return null;
        return (
          <div key={g} className="mb-2">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              {GRUPO_LABEL[g as GrupoRequisito]}
            </p>
            <div className="grid gap-0.5 sm:grid-cols-2">
              {items.map((r) => (
                <label
                  key={r.codigo}
                  className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-[12.5px] text-ink transition-colors hover:bg-surface-2"
                >
                  <input
                    type="checkbox"
                    checked={marcados.has(r.codigo)}
                    onChange={() => toggle(r.codigo)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    {r.nombre}
                    <span className="ml-1 inline-flex gap-1 align-middle">
                      {!r.subsanable && (
                        <span className="rounded bg-danger-soft px-1 text-[9.5px] font-semibold uppercase text-danger">
                          No subsanable
                        </span>
                      )}
                      {r.via === "linea" && (
                        <span className="rounded bg-surface-2 px-1 text-[9.5px] uppercase text-muted">
                          En línea
                        </span>
                      )}
                      {r.via === "genera" && (
                        <span className="rounded bg-primary/10 px-1 text-[9.5px] font-semibold uppercase text-primary">
                          Se genera
                        </span>
                      )}
                      {r.via === "empresa" && (
                        <span className="rounded bg-ok-soft px-1 text-[9.5px] uppercase text-ok">
                          De Empresa
                        </span>
                      )}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
      {plantillasOrg.filter((p) => !yaEstan.has(p.codigo)).length > 0 && (
        <div className="mb-2">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            Tus plantillas (Configuración → Plantillas)
          </p>
          <div className="grid gap-0.5 sm:grid-cols-2">
            {plantillasOrg
              .filter((p) => !yaEstan.has(p.codigo))
              .map((p) => (
                <label
                  key={p.codigo}
                  className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-[12.5px] text-ink transition-colors hover:bg-surface-2"
                >
                  <input
                    type="checkbox"
                    checked={marcados.has(p.codigo)}
                    onChange={() => toggle(p.codigo)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    {p.nombre}
                    <span className="ml-1 rounded bg-primary/10 px-1 align-middle text-[9.5px] font-semibold uppercase text-primary">
                      Se genera
                    </span>
                  </span>
                </label>
              ))}
          </div>
        </div>
      )}
      {disponibles.length === 0 && plantillasOrg.filter((p) => !yaEstan.has(p.codigo)).length === 0 ? (
        <p className="text-[12.5px] text-muted">
          Todo el checklist estándar ya está en este proceso.
        </p>
      ) : (
        <button
          type="button"
          disabled={pendiente || marcados.size === 0}
          onClick={() => onAgregar([...marcados])}
          className={btnPrimary("!px-3 !py-1.5 !text-[12.5px]")}
        >
          Agregar {marcados.size} requisito{marcados.size === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );
}

function FormManual({
  pendiente,
  onAgregar,
}: {
  pendiente: boolean;
  onAgregar: (datos: {
    codigo: string;
    nombre: string;
    subsanable: boolean;
    firmante_rol: LicRequisito["firmante_rol"];
    fuente: string | null;
  }) => void;
}) {
  return (
    <form
      action={(fd) =>
        onAgregar({
          codigo: String(fd.get("codigo") || ""),
          nombre: String(fd.get("nombre") || ""),
          subsanable: String(fd.get("subsanable")) === "si",
          firmante_rol: String(fd.get("firmante_rol") || "gerente_general") as LicRequisito["firmante_rol"],
          fuente: String(fd.get("fuente") || "") || null,
        })
      }
      className="grid gap-2 border-b border-line p-3 sm:grid-cols-2"
    >
      <input name="codigo" required placeholder="Código (propio del pliego)" className={`${inputSm} font-mono`} />
      <input name="nombre" required placeholder="Nombre del requisito" className={inputSm} />
      <select name="subsanable" defaultValue="no" className={inputSm}>
        <option value="no">NO subsanable (crítico)</option>
        <option value="si">Subsanable</option>
      </select>
      <select name="firmante_rol" defaultValue="gerente_general" className={inputSm}>
        {FIRMANTES.map(([v, l]) => (
          <option key={v} value={v}>Firma: {l}</option>
        ))}
      </select>
      <input name="fuente" placeholder="Dónde lo exige el pliego (§10.1.a)" className={`${inputSm} sm:col-span-2`} />
      <div className="sm:col-span-2">
        <button type="submit" disabled={pendiente} className={btnPrimary("!px-2.5 !py-1 !text-[12.5px]")}>
          Agregar
        </button>
      </div>
    </form>
  );
}

function FilaRequisito({
  r,
  preguntas,
  pendiente,
  subsanacionId,
  onToggleSub,
  onPatch,
  onSubir,
  onEliminar,
}: {
  r: LicRequisito;
  // Variables "se pregunta al generar" de la plantilla de la org detrás de
  // este requisito — cada proceso captura sus valores aquí.
  preguntas: { clave: string; etiqueta: string }[];
  pendiente: boolean;
  subsanacionId: string | null;
  onToggleSub: (marcar: boolean) => void;
  onPatch: (patch: Parameters<typeof actualizarRequisitoAction>[1]) => void;
  onSubir: (fd: FormData) => void;
  onEliminar: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const critico = !r.subsanable;
  const pendienteEstado = r.estado === "pendiente";
  const estandar = requisitoEstandar(r.codigo);
  // Por dónde llega: estándar → su vía; origen "generado" (plantilla de la
  // org creada en el constructor) → se genera aquí; el resto se sube.
  const via = estandar?.via ?? (r.origen === "generado" ? "genera" : "sube");
  const cubiertoPorEmpresa = r.origen === "documento_empresa" && !!r.documento_empresa_id;

  return (
    <li className="px-4 py-2">
      <div className="flex items-center gap-2.5">
        {/* El semáforo del gate: rojo = crítico pendiente. */}
        <span
          className={`h-2.5 w-2.5 flex-none rounded-full ${
            pendienteEstado ? (critico ? "bg-danger" : "bg-warn") : "bg-ok"
          }`}
          title={pendienteEstado ? (critico ? "Crítico pendiente" : "Pendiente") : "Listo"}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-ink">
            {r.nombre}
            <button
              type="button"
              onClick={() => onPatch({ subsanable: !r.subsanable })}
              className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide transition-colors ${
                critico
                  ? "bg-danger-soft text-danger"
                  : "bg-surface-2 text-muted hover:text-ink"
              }`}
              title="Cambiar subsanable / no subsanable"
            >
              {critico ? "No subsanable" : "Subsanable"}
            </button>
          </p>
          <p className="text-[11.5px] text-muted">
            <span className="font-mono">{r.codigo}</span>
            {r.fuente ? ` · ${r.fuente}` : ""}
            {" · firma: "}
            {r.firmante_rol === "ninguno" ? "nadie" : ROL_FIRMANTE_LABEL[r.firmante_rol]}
          </p>
        </div>

        {/* La VÍA del documento: no todo se sube. */}
        {via === "genera" && (
          <span
            className="whitespace-nowrap rounded bg-primary/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-primary"
            title="Este formulario lo generará el sistema (motor documental). Mientras tanto puedes subirlo hecho."
          >
            Se genera aquí
          </span>
        )}
        {via === "linea" && (
          <span
            className="whitespace-nowrap rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium text-muted"
            title="No se deposita archivo: la entidad lo verifica en línea"
          >
            Verificado en línea
          </span>
        )}
        {via === "empresa" &&
          (cubiertoPorEmpresa ? (
            <span
              className="whitespace-nowrap rounded bg-ok-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-ok"
              title="El paquete lo toma de la documentación de la empresa"
            >
              De Empresa ✓
            </span>
          ) : (
            <a
              href="/configuracion/empresa"
              className="whitespace-nowrap rounded bg-warn-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-warn hover:underline"
              title="Falta o está vencido en Configuración → Empresa — cárgalo allá una sola vez"
            >
              Falta en Empresa
            </a>
          ))}

        {/* Con subsanación abierta: marcar este requisito como PEDIDO lo
            devuelve a pendiente y lo mete al paquete de subsanación. */}
        {subsanacionId && (
          <button
            type="button"
            onClick={() => onToggleSub(r.subsanacion_id !== subsanacionId)}
            disabled={pendiente}
            className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-semibold transition-colors ${
              r.subsanacion_id === subsanacionId
                ? "bg-warn-soft text-warn"
                : "bg-surface-2 text-muted hover:text-ink"
            }`}
            title={
              r.subsanacion_id === subsanacionId
                ? "La entidad lo pidió en la subsanación — clic para quitarlo"
                : "La entidad pidió este documento en la subsanación"
            }
          >
            {r.subsanacion_id === subsanacionId ? "Pedido ✓" : "Subsanar"}
          </button>
        )}

        {r.storage_path && (
          <VisorDocumento
            bucket="documentos"
            path={r.storage_path}
            nombre={`${r.codigo}.pdf`}
            className="text-[12px] font-medium text-primary transition-colors hover:underline"
          />
        )}

        {/* Subir aplica a lo externo; en lo generado es el plan B mientras
            llega el motor documental. Lo "en línea" y lo de Empresa no suben. */}
        {via !== "linea" && !cubiertoPorEmpresa && (
          <>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const fd = new FormData();
                fd.set("archivo", f);
                onSubir(fd);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={pendiente}
              className="flex items-center gap-1 text-[12px] text-muted transition-colors hover:text-ink"
              title={
                via === "genera"
                  ? "Mientras el motor documental no existe, súbelo hecho a mano"
                  : "Subir el archivo de este requisito (lo marca listo)"
              }
            >
              <Paperclip className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {r.storage_path ? "Reemplazar" : via === "genera" ? "Subir hecho" : "Subir"}
            </button>
          </>
        )}

        <label className="flex items-center gap-1 text-[12px] text-ink-soft" title="Listo / pendiente">
          <input
            type="checkbox"
            defaultChecked={r.estado === "listo"}
            onChange={(e) => onPatch({ estado: e.target.checked ? "listo" : "pendiente" })}
          />
          Listo
        </label>

        <button
          type="button"
          onClick={onEliminar}
          disabled={pendiente}
          className="rounded p-1 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
          aria-label="Eliminar requisito"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>

      {/* Los datos que la plantilla pregunta en cada proceso. Autosave al
          salir del campo; sin todos completos, Generar paquete avisa. */}
      {preguntas.length > 0 && (
        <div className="ml-5 mt-1.5 grid gap-1.5 sm:grid-cols-2">
          {preguntas.map((p) => {
            const valor = r.datos?.[p.clave] ?? "";
            return (
              <label key={p.clave} className="block">
                <span className={`text-[11px] ${valor ? "text-muted" : "font-semibold text-warn"}`}>
                  {p.etiqueta}
                  {!valor && " — falta"}
                </span>
                <input
                  defaultValue={valor}
                  placeholder={p.etiqueta}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== valor) onPatch({ datos: { ...r.datos, [p.clave]: v } });
                  }}
                  className={`${inputSm} w-full`}
                />
              </label>
            );
          })}
        </div>
      )}
    </li>
  );
}
