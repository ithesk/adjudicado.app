"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, FileText } from "lucide-react";
import { formatFecha, type Documento } from "@/lib/types";
import { Panel, SectionTitle } from "@/components/ui";
import VisorDocumento from "@/components/VisorDocumento";
import SubirArchivo from "@/components/SubirArchivo";
import { carpetaDeOrden, registrarDocumentoOrden } from "../actions";

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
  const router = useRouter();
  // El tipo se elige antes de escoger el archivo: la subida arranca sola al
  // seleccionarlo, así que ya no hay un botón de «enviar» donde leerlo.
  const [tipo, setTipo] = useState(TIPOS[0]?.v ?? "otro");

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

      <div className="flex flex-wrap items-end gap-3 border-t border-line p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">
            Tipo
          </span>
          <select
            name="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="rounded-md border border-line bg-surface px-2 py-2 text-sm text-ink outline-none focus:border-primary"
          >
            {TIPOS.map((t) => (
              <option key={t.v} value={t.v}>
                {t.l}
              </option>
            ))}
          </select>
        </label>
        {/* Sube DIRECTO al almacenamiento, con porcentaje real. Pasando por
            el servidor, un adjunto de más de 4,5 MB fallaba sin explicación
            (lo rechaza la plataforma antes de ejecutar nada) y no había
            manera de ver por dónde iba. */}
        <SubirArchivo
          carpeta={() => carpetaDeOrden(ordenId)}
          onRegistrar={(ruta: string, nombre: string) =>
            registrarDocumentoOrden(ordenId, ruta, nombre, tipo)
          }
          etiqueta="Subir un documento"
          onListo={() => router.refresh()}
        />
      </div>
    </Panel>
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
