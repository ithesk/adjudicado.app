"use client";

// Documentación de la empresa. Flujo de subida SIN formulario aparte:
// «Subir» en una fila abre el selector de archivo directo (el tipo ya se
// sabe — es la fila), y al elegir el archivo la propia fila se expande para
// pedir solo las fechas. Nada aparece fuera de la vista.

import { useRef, useState, useTransition } from "react";
import { FileCheck2, Loader2, Plus, Trash2, History, X } from "lucide-react";
import { Panel, SectionTitle, btnPrimary, btnGhost } from "@/components/ui";
import VisorDocumento from "@/components/VisorDocumento";
import { urgenciaChip, urgenciaDot, textoDias } from "@/lib/ui";
import {
  estadoDocumentacion,
  tipoDoc,
  type DocumentoEmpresa,
  type FilaDocumentacion,
  type TipoDocEmpresa,
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

const ACEPTA = ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx";

interface Borrador {
  tipo: string;
  archivo: File;
}

export default function DocsEmpresa({ docs }: { docs: DocumentoEmpresa[] }) {
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [verHistorial, setVerHistorial] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  // Un solo <input file> oculto para todas las filas: al hacer clic en
  // «Subir» se recuerda el tipo y se abre el selector del sistema directo.
  const fileRef = useRef<HTMLInputElement>(null);
  const tipoElegidoRef = useRef<string>("otro");

  const filas = estadoDocumentacion(docs);

  function elegirArchivo(tipo: string) {
    setError(null);
    tipoElegidoRef.current = tipo;
    fileRef.current?.click();
  }

  function archivoElegido(f: File | undefined | null) {
    if (!f) return;
    setBorrador({ tipo: tipoElegidoRef.current, archivo: f });
  }

  function confirmarSubida(fd: FormData) {
    if (!borrador) return;
    fd.set("archivo", borrador.archivo);
    fd.set("tipo", borrador.tipo);
    setError(null);
    startTransition(async () => {
      const err = await subirDocEmpresa(fd);
      if (err) setError(err);
      else setBorrador(null);
    });
  }

  function guardarFechas(id: string, fd: FormData) {
    setError(null);
    startTransition(async () => {
      const err = await actualizarFechasDocEmpresa(
        id,
        String(fd.get("fecha_emision") || "") || null,
        String(fd.get("fecha_vencimiento") || "") || null,
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

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept={ACEPTA}
        className="hidden"
        onChange={(e) => {
          archivoElegido(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      )}

      <Panel>
        <SectionTitle icon={FileCheck2}>Estado de la documentación</SectionTitle>

        <ul className="divide-y divide-line">
          {filas.map((f) => (
            <FilaDoc
              key={f.vigente ? f.vigente.id : f.tipo.codigo}
              fila={f}
              borrador={
                // El alta de "otro" vive en su fila fija de abajo.
                borrador?.tipo === f.tipo.codigo && f.tipo.codigo !== "otro"
                  ? borrador
                  : null
              }
              pendiente={pendiente}
              editando={editando}
              setEditando={setEditando}
              verHistorial={verHistorial}
              setVerHistorial={setVerHistorial}
              onSubir={() => elegirArchivo(f.tipo.codigo)}
              onConfirmar={confirmarSubida}
              onCancelar={() => setBorrador(null)}
              onGuardarFechas={guardarFechas}
              onEliminar={eliminar}
            />
          ))}

          {/* Cualquier documento fuera del catálogo. */}
          <li className="px-4 py-2.5">
            {borrador?.tipo === "otro" ? (
              <FormFechas
                tipo={tipoDoc("otro")}
                archivo={borrador.archivo}
                conNombre
                pendiente={pendiente}
                onConfirmar={confirmarSubida}
                onCancelar={() => setBorrador(null)}
              />
            ) : (
              <button
                type="button"
                onClick={() => elegirArchivo("otro")}
                className="flex items-center gap-2 text-[12.5px] font-medium text-muted transition-colors hover:text-ink"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
                Subir otro documento (fuera de la lista)
              </button>
            )}
          </li>
        </ul>
      </Panel>
    </div>
  );
}

// La mini-fila de confirmación: aparece EN la fila al elegir el archivo.
// El tipo ya se sabe; solo pide las fechas (y el nombre, si es "otro").
function FormFechas({
  tipo,
  archivo,
  conNombre = false,
  pendiente,
  onConfirmar,
  onCancelar,
}: {
  tipo: TipoDocEmpresa;
  archivo: File;
  conNombre?: boolean;
  pendiente: boolean;
  onConfirmar: (fd: FormData) => void;
  onCancelar: () => void;
}) {
  return (
    <form
      action={onConfirmar}
      className="flex flex-wrap items-end gap-2 rounded-md bg-surface-2 px-3 py-2"
    >
      <span className="mr-1 max-w-56 truncate text-[12.5px] font-medium text-ink" title={archivo.name}>
        {archivo.name}
      </span>
      {conNombre && (
        <label className="text-[11.5px] text-muted">
          Nombre
          <input
            name="nombre"
            placeholder={archivo.name}
            className={`${inputSm} mt-0.5 block w-44`}
          />
        </label>
      )}
      <label className="text-[11.5px] text-muted">
        Emisión
        <input type="date" name="fecha_emision" className={`${inputSm} mt-0.5 block`} />
      </label>
      <label className="text-[11.5px] text-muted">
        {tipo.vence ? "Vencimiento *" : "Vencimiento (si aplica)"}
        <input
          type="date"
          name="fecha_vencimiento"
          required={tipo.vence}
          className={`${inputSm} mt-0.5 block`}
        />
      </label>
      <button type="submit" disabled={pendiente} className={btnPrimary("!px-2.5 !py-1 !text-[12.5px]")}>
        {pendiente ? (
          <>
            <Loader2 className="h-3 w-3 motion-safe:animate-spin" strokeWidth={2} aria-hidden />
            Subiendo…
          </>
        ) : (
          "Guardar"
        )}
      </button>
      <button
        type="button"
        onClick={onCancelar}
        className={btnGhost("!px-2 !py-1 !text-[12.5px]")}
        aria-label="Cancelar subida"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </form>
  );
}

function FilaDoc({
  fila,
  borrador,
  pendiente,
  editando,
  setEditando,
  verHistorial,
  setVerHistorial,
  onSubir,
  onConfirmar,
  onCancelar,
  onGuardarFechas,
  onEliminar,
}: {
  fila: FilaDocumentacion;
  borrador: Borrador | null;
  pendiente: boolean;
  editando: string | null;
  setEditando: (id: string | null) => void;
  verHistorial: string | null;
  setVerHistorial: (id: string | null) => void;
  onSubir: () => void;
  onConfirmar: (fd: FormData) => void;
  onCancelar: () => void;
  onGuardarFechas: (id: string, fd: FormData) => void;
  onEliminar: (id: string, nombre: string) => void;
}) {
  const { tipo, vigente, dias, nivel, historial } = fila;
  // Los "otro" ya cargados se manejan como filas normales; el alta de un
  // "otro" nuevo vive en la fila fija de abajo.
  if (tipo.codigo === "otro" && !vigente) return null;

  return (
    <li className="space-y-2 px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span
          className={`h-2 w-2 flex-none rounded-full ${
            vigente ? urgenciaDot(nivel) : "border border-line-strong"
          }`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className={`truncate text-[13px] ${vigente ? "font-medium text-ink" : "text-muted"}`}>
            {tipo.codigo === "otro" ? vigente?.nombre : tipo.label}
          </p>
          {vigente ? (
            <p className="truncate text-[11.5px] text-muted">
              {tipo.codigo === "otro" ? tipo.label : vigente.nombre}
              {vigente.fecha_vencimiento
                ? ` · vence ${fmtFecha(vigente.fecha_vencimiento)}`
                : " · no vence"}
            </p>
          ) : (
            <p className="truncate text-[11.5px] text-muted">{tipo.descripcion}</p>
          )}
        </div>

        {vigente ? (
          <>
            {vigente.fecha_vencimiento ? (
              <span className={`rounded px-1.5 py-0.5 font-mono text-xs font-medium ${urgenciaChip(nivel)}`}>
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
              onClick={() => setEditando(editando === vigente.id ? null : vigente.id)}
              className="text-[12.5px] text-muted transition-colors hover:text-ink"
            >
              Fechas
            </button>
            <button
              type="button"
              onClick={onSubir}
              className="text-[12.5px] font-medium text-primary transition-colors hover:underline"
              title="Subir la renovación (la actual queda como historial)"
            >
              Renovar
            </button>
            {historial.length > 0 && (
              <button
                type="button"
                onClick={() => setVerHistorial(verHistorial === vigente.id ? null : vigente.id)}
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
          </>
        ) : (
          <>
            <span className="text-[12px] text-muted">No cargado</span>
            <button
              type="button"
              onClick={onSubir}
              className="text-[12.5px] font-medium text-primary transition-colors hover:underline"
            >
              Subir
            </button>
          </>
        )}
      </div>

      {/* El archivo ya se eligió: solo faltan las fechas, aquí mismo. */}
      {borrador && (
        <FormFechas
          tipo={tipo}
          archivo={borrador.archivo}
          pendiente={pendiente}
          onConfirmar={onConfirmar}
          onCancelar={onCancelar}
        />
      )}

      {editando === vigente?.id && (
        <form
          action={(fd) => onGuardarFechas(vigente.id, fd)}
          className="flex flex-wrap items-end gap-2 pl-5"
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
          <button type="submit" disabled={pendiente} className={btnPrimary("!px-2.5 !py-1 !text-[12.5px]")}>
            Guardar
          </button>
          <button type="button" onClick={() => setEditando(null)} className={btnGhost("!px-2.5 !py-1 !text-[12.5px]")}>
            Cancelar
          </button>
        </form>
      )}

      {verHistorial === vigente?.id && historial.length > 0 && (
        <ul className="ml-1 space-y-1 border-l border-line pl-4">
          {historial.map((h) => (
            <li key={h.id} className="flex items-center gap-3 py-1">
              <span className="min-w-0 flex-1 truncate text-[12px] text-muted">
                {h.nombre}
                {h.fecha_vencimiento ? ` · venció ${fmtFecha(h.fecha_vencimiento)}` : ""}
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
