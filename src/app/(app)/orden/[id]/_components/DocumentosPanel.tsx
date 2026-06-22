"use client";

import { useFormStatus } from "react-dom";
import { Paperclip, FileText, Upload } from "lucide-react";
import { formatFecha, type Documento } from "@/lib/types";
import { Panel, SectionTitle } from "@/components/ui";
import VisorDocumento from "@/components/VisorDocumento";
import { subirDocumento } from "../actions";

const TIPOS = [
  { v: "acta", l: "Acta" },
  { v: "carta_fabricante", l: "Carta fabricante" },
  { v: "factura", l: "Factura" },
  { v: "otro", l: "Otro" },
];

export default function DocumentosPanel({
  ordenId,
  documentos,
  ocArchivo,
}: {
  ordenId: string;
  documentos: Documento[];
  ocArchivo: string | null;
}) {
  const subir = subirDocumento.bind(null, ordenId);

  return (
    <Panel>
      <SectionTitle icon={Paperclip}>Documentos</SectionTitle>

      <ul className="divide-y divide-line">
        {ocArchivo && (
          <DocRow
            nombre="OC original"
            sub="Orden de compra · PDF"
            bucket="ordenes-oc"
            path={ocArchivo}
          />
        )}
        {documentos.map((d) => (
          <DocRow
            key={d.id}
            nombre={d.nombre}
            sub={`${d.tipo} · ${formatFecha(d.created_at.slice(0, 10))}`}
            bucket="documentos"
            path={d.archivo_url}
          />
        ))}
        {documentos.length === 0 && !ocArchivo && (
          <li className="px-4 py-5 text-center text-[13px] text-muted">
            Sin documentos.
          </li>
        )}
      </ul>

      <form
        action={subir}
        className="flex flex-wrap items-end gap-2 border-t border-line p-4"
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">
            Tipo
          </span>
          <select
            name="tipo"
            className="rounded-md border border-line bg-surface px-2 py-2 text-sm text-ink outline-none focus:border-primary"
          >
            {TIPOS.map((t) => (
              <option key={t.v} value={t.v}>
                {t.l}
              </option>
            ))}
          </select>
        </label>
        <input
          type="file"
          name="archivo"
          required
          className="max-w-[12rem] text-xs text-muted file:mr-2 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-xs file:text-ink"
        />
        <BotonSubir />
      </form>
    </Panel>
  );
}

function BotonSubir() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink disabled:opacity-55"
    >
      <Upload className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      {pending ? "Subiendo…" : "Subir"}
    </button>
  );
}

function DocRow({
  nombre,
  sub,
  bucket,
  path,
}: {
  nombre: string;
  sub: string;
  bucket: "documentos" | "ordenes-oc";
  path: string;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <FileText className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-ink">{nombre}</p>
        <p className="text-[11px] uppercase tracking-wide text-muted">{sub}</p>
      </div>
      <VisorDocumento bucket={bucket} path={path} nombre={nombre} />
    </li>
  );
}
