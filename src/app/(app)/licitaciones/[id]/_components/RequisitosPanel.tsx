"use client";

// El checklist de requisitos. El flag subsanable/no-subsanable es el
// protagonista: un NO subsanable pendiente es lo que descalifica.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileWarning, Paperclip, Plus, Trash2 } from "lucide-react";
import { Panel, SectionTitle, btnPrimary } from "@/components/ui";
import VisorDocumento from "@/components/VisorDocumento";
import {
  actualizarRequisitoAction,
  crearRequisitoAction,
  eliminarRequisitoAction,
  subirArchivoRequisitoAction,
} from "@/lib/actions/licitaciones";
import {
  ROL_FIRMANTE_LABEL,
  type LicRequisito,
} from "@/lib/licitaciones/tipos";

const inputSm =
  "rounded-md border border-line bg-surface px-2 py-1 text-[12.5px] text-ink outline-none focus:border-primary";

const FIRMANTES = [
  ["gerente_general", ROL_FIRMANTE_LABEL.gerente_general],
  ["gerente_ventas", ROL_FIRMANTE_LABEL.gerente_ventas],
  ["ninguno", "Nadie firma"],
] as const;

export default function RequisitosPanel({
  procesoId,
  requisitos,
}: {
  procesoId: string;
  requisitos: LicRequisito[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [pendiente, startTransition] = useTransition();

  function correr(fn: () => Promise<string | null>) {
    setError(null);
    startTransition(async () => {
      const err = await fn();
      if (err) setError(err);
      router.refresh();
    });
  }

  function agregar(fd: FormData) {
    correr(() =>
      crearRequisitoAction(procesoId, {
        codigo: String(fd.get("codigo") || ""),
        nombre: String(fd.get("nombre") || ""),
        // El <select> obliga a decidir: crítico por defecto (fail-safe).
        subsanable: String(fd.get("subsanable")) === "si",
        firmante_rol: String(fd.get("firmante_rol") || "gerente_general") as LicRequisito["firmante_rol"],
        fuente: String(fd.get("fuente") || "") || null,
      }),
    );
    setAgregando(false);
  }

  return (
    <Panel>
      <SectionTitle
        icon={FileWarning}
        right={
          <button
            type="button"
            onClick={() => setAgregando((v) => !v)}
            className={btnPrimary("!px-2.5 !py-1 !text-[12.5px]")}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
            Requisito
          </button>
        }
      >
        Requisitos ({requisitos.length})
      </SectionTitle>

      {error && (
        <p className="mx-4 mt-3 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      )}

      {agregando && (
        <form action={agregar} className="grid gap-2 border-b border-line p-3 sm:grid-cols-2">
          <input name="codigo" required placeholder="Código (SNCC.F.042, CERT-TSS…)" className={`${inputSm} font-mono`} />
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
          <input name="fuente" placeholder="Dónde lo exige el pliego (§3.1.a)" className={`${inputSm} sm:col-span-2`} />
          <div className="sm:col-span-2">
            <button type="submit" disabled={pendiente} className={btnPrimary("!px-2.5 !py-1 !text-[12.5px]")}>
              Agregar
            </button>
          </div>
        </form>
      )}

      <ul className="divide-y divide-line">
        {requisitos.map((r) => (
          <FilaRequisito
            key={r.id}
            r={r}
            pendiente={pendiente}
            onPatch={(patch) => correr(() => actualizarRequisitoAction(r.id, patch))}
            onSubir={(fd) => correr(() => subirArchivoRequisitoAction(r.id, fd))}
            onEliminar={() => {
              if (confirm(`¿Eliminar el requisito ${r.codigo}?`))
                correr(() => eliminarRequisitoAction(r.id));
            }}
          />
        ))}
        {requisitos.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted">
            Carga los requisitos del pliego. Marca cada uno como subsanable o
            NO subsanable — ese flag es el que evita la descalificación.
          </li>
        )}
      </ul>
    </Panel>
  );
}

function FilaRequisito({
  r,
  pendiente,
  onPatch,
  onSubir,
  onEliminar,
}: {
  r: LicRequisito;
  pendiente: boolean;
  onPatch: (patch: Parameters<typeof actualizarRequisitoAction>[1]) => void;
  onSubir: (fd: FormData) => void;
  onEliminar: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const critico = !r.subsanable;
  const pendienteEstado = r.estado === "pendiente";

  return (
    <li className="px-4 py-2.5">
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
            <span className="font-mono text-xs text-muted">{r.codigo}</span>
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
            {r.fuente ? `${r.fuente} · ` : ""}
            Firma: {r.firmante_rol === "ninguno" ? "nadie" : ROL_FIRMANTE_LABEL[r.firmante_rol]}
          </p>
        </div>

        {r.storage_path && (
          <VisorDocumento
            bucket="documentos"
            path={r.storage_path}
            nombre={`${r.codigo}.pdf`}
            className="text-[12px] font-medium text-primary transition-colors hover:underline"
          />
        )}

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
          title="Subir el archivo de este requisito (lo marca listo)"
        >
          <Paperclip className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {r.storage_path ? "Reemplazar" : "Subir"}
        </button>

        <label className="flex items-center gap-1 text-[12px] text-ink-soft" title="Listo / pendiente">
          <input
            type="checkbox"
            checked={r.estado === "listo"}
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
    </li>
  );
}
