"use client";

import { useState, useTransition } from "react";
import { FileCheck2, Plus, Trash2, Upload, History, X } from "lucide-react";
import { Panel, SectionTitle, btnPrimary, btnGhost, inputBase } from "@/components/ui";
import VisorDocumento from "@/components/VisorDocumento";
import { urgenciaChip, urgenciaDot, textoDias } from "@/lib/ui";
import {
  TIPOS_DOC_EMPRESA,
  estadoDocumentacion,
  type DocumentoEmpresa,
  type FilaDocumentacion,
} from "@/lib/empresa/documentos";
import {
  subirDocEmpresa,
  actualizarFechasDocEmpresa,
  eliminarDocEmpresa,
} from "@/lib/actions/empresa";

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("es-DO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const inputSm =
  "rounded-md border border-line bg-surface px-2 py-1 text-[12.5px] text-ink outline-none focus:border-primary";

export default function DocsEmpresa({ docs }: { docs: DocumentoEmpresa[] }) {
  const [abrirSubida, setAbrirSubida] = useState(false);
  const [tipoPre, setTipoPre] = useState("rpe");
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [verHistorial, setVerHistorial] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const filas = estadoDocumentacion(docs);

  function subir(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const err = await subirDocEmpresa(formData);
      if (err) setError(err);
      else setAbrirSubida(false);
    });
  }

  function guardarFechas(id: string, formData: FormData) {
    setError(null);
    startTransition(async () => {
      const err = await actualizarFechasDocEmpresa(
        id,
        String(formData.get("fecha_emision") || "") || null,
        String(formData.get("fecha_vencimiento") || "") || null,
      );
      if (err) setError(err);
      else setEditando(null);
    });
  }

  function eliminar(id: string, nombre: string) {
    if (!confirm(`¿Eliminar "${nombre}"? No se puede deshacer.`)) return;
    setError(null);
    startTransition(async () => {
      const err = await eliminarDocEmpresa(id);
      if (err) setError(err);
    });
  }

  function nuevo(tipo: string) {
    setTipoPre(tipo);
    setAbrirSubida(true);
    setError(null);
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      )}

      <Panel>
        <SectionTitle
          icon={FileCheck2}
          right={
            <button
              type="button"
              onClick={() => nuevo("rpe")}
              className={btnPrimary("!px-2.5 !py-1 !text-[12.5px]")}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
              Subir documento
            </button>
          }
        >
          Estado de la documentación
        </SectionTitle>

        <ul className="divide-y divide-line">
          {filas.map((f) => (
            <FilaDoc
              key={f.vigente ? f.vigente.id : f.tipo.codigo}
              fila={f}
              editando={editando}
              setEditando={setEditando}
              verHistorial={verHistorial}
              setVerHistorial={setVerHistorial}
              onGuardar={guardarFechas}
              onEliminar={eliminar}
              onSubir={nuevo}
              pendiente={pendiente}
            />
          ))}
        </ul>
      </Panel>

      {abrirSubida && (
        <Panel>
          <SectionTitle
            icon={Upload}
            right={
              <button
                type="button"
                onClick={() => setAbrirSubida(false)}
                className="text-muted transition-colors hover:text-ink"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            }
          >
            Subir documento
          </SectionTitle>

          <form action={subir} className="grid gap-3 p-4 sm:grid-cols-2">
            <label className="text-[12.5px] text-muted">
              Tipo
              <select
                name="tipo"
                defaultValue={tipoPre}
                className={`${inputBase} mt-1`}
              >
                {TIPOS_DOC_EMPRESA.map((t) => (
                  <option key={t.codigo} value={t.codigo}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-[12.5px] text-muted">
              Archivo
              <input
                type="file"
                name="archivo"
                required
                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                className={`${inputBase} mt-1 file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-[12px] file:text-ink-soft`}
              />
            </label>

            <label className="text-[12.5px] text-muted">
              Nombre (opcional)
              <input
                type="text"
                name="nombre"
                placeholder="Por defecto, el nombre del archivo"
                className={`${inputBase} mt-1`}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-[12.5px] text-muted">
                Emisión
                <input type="date" name="fecha_emision" className={`${inputBase} mt-1`} />
              </label>
              <label className="text-[12.5px] text-muted">
                Vencimiento
                <input
                  type="date"
                  name="fecha_vencimiento"
                  className={`${inputBase} mt-1`}
                />
              </label>
            </div>

            <p className="text-[12px] text-muted sm:col-span-2">
              Deja el vencimiento vacío si el documento no caduca (acta
              constitutiva, estados financieros…).
            </p>

            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" disabled={pendiente} className={btnPrimary()}>
                {pendiente ? "Subiendo…" : "Guardar"}
              </button>
              <button
                type="button"
                onClick={() => setAbrirSubida(false)}
                className={btnGhost()}
              >
                Cancelar
              </button>
            </div>
          </form>
        </Panel>
      )}
    </div>
  );
}

function FilaDoc({
  fila,
  editando,
  setEditando,
  verHistorial,
  setVerHistorial,
  onGuardar,
  onEliminar,
  onSubir,
  pendiente,
}: {
  fila: FilaDocumentacion;
  editando: string | null;
  setEditando: (id: string | null) => void;
  verHistorial: string | null;
  setVerHistorial: (id: string | null) => void;
  onGuardar: (id: string, fd: FormData) => void;
  onEliminar: (id: string, nombre: string) => void;
  onSubir: (tipo: string) => void;
  pendiente: boolean;
}) {
  const { tipo, vigente, dias, nivel, historial } = fila;

  // Tipo del catálogo sin ningún documento: el hueco se ve, que es el punto.
  if (!vigente) {
    return (
      <li className="flex items-center gap-3 px-4 py-2.5">
        <span className="h-2 w-2 flex-none rounded-full border border-line-strong" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-muted">{tipo.label}</p>
        </div>
        <span className="text-[12px] text-muted">No cargado</span>
        <button
          type="button"
          onClick={() => onSubir(tipo.codigo)}
          className="text-[12.5px] font-medium text-primary transition-colors hover:underline"
        >
          Subir
        </button>
      </li>
    );
  }

  const enEdicion = editando === vigente.id;

  return (
    <li className="px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span
          className={`h-2 w-2 flex-none rounded-full ${urgenciaDot(nivel)}`}
          aria-hidden
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink">{tipo.label}</p>
          <p className="truncate text-[11.5px] text-muted">
            {vigente.nombre}
            {vigente.fecha_vencimiento
              ? ` · vence ${fmtFecha(vigente.fecha_vencimiento)}`
              : " · no vence"}
          </p>
        </div>

        {vigente.fecha_vencimiento ? (
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-xs font-medium ${urgenciaChip(nivel)}`}
          >
            {textoDias(dias)}
          </span>
        ) : (
          <span className="font-mono text-xs text-muted">—</span>
        )}

        <VisorDocumento
          bucket="documentos"
          path={vigente.archivo_url}
          nombre={vigente.nombre}
          className="text-[12.5px] font-medium text-primary transition-colors hover:underline"
        />

        <button
          type="button"
          onClick={() => setEditando(enEdicion ? null : vigente.id)}
          className="text-[12.5px] text-muted transition-colors hover:text-ink"
        >
          Fechas
        </button>

        {historial.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setVerHistorial(verHistorial === vigente.id ? null : vigente.id)
            }
            className="flex items-center gap-1 text-[12px] text-muted transition-colors hover:text-ink"
            title="Versiones anteriores"
          >
            <History className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {historial.length}
          </button>
        )}

        <button
          type="button"
          onClick={() => onEliminar(vigente.id, vigente.nombre)}
          disabled={pendiente}
          className="rounded p-1 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
          aria-label="Eliminar"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>

      {enEdicion && (
        <form
          action={(fd) => onGuardar(vigente.id, fd)}
          className="mt-2 flex flex-wrap items-end gap-2 pl-5"
        >
          <label className="text-[11.5px] text-muted">
            Emisión
            <input
              type="date"
              name="fecha_emision"
              defaultValue={vigente.fecha_emision ?? ""}
              className={`${inputSm} mt-0.5 block`}
            />
          </label>
          <label className="text-[11.5px] text-muted">
            Vencimiento
            <input
              type="date"
              name="fecha_vencimiento"
              defaultValue={vigente.fecha_vencimiento ?? ""}
              className={`${inputSm} mt-0.5 block`}
            />
          </label>
          <button
            type="submit"
            disabled={pendiente}
            className={btnPrimary("!px-2.5 !py-1 !text-[12.5px]")}
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => setEditando(null)}
            className={btnGhost("!px-2.5 !py-1 !text-[12.5px]")}
          >
            Cancelar
          </button>
        </form>
      )}

      {verHistorial === vigente.id && historial.length > 0 && (
        <ul className="mt-2 space-y-1 border-l border-line pl-4 ml-1">
          {historial.map((h) => (
            <li key={h.id} className="flex items-center gap-3 py-1">
              <span className="min-w-0 flex-1 truncate text-[12px] text-muted">
                {h.nombre}
                {h.fecha_vencimiento
                  ? ` · venció ${fmtFecha(h.fecha_vencimiento)}`
                  : ""}
              </span>
              <VisorDocumento
                bucket="documentos"
                path={h.archivo_url}
                nombre={h.nombre}
                className="text-[12px] text-muted transition-colors hover:text-ink"
              />
              <button
                type="button"
                onClick={() => onEliminar(h.id, h.nombre)}
                disabled={pendiente}
                className="rounded p-1 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                aria-label="Eliminar"
              >
                <Trash2 className="h-3 w-3" strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
