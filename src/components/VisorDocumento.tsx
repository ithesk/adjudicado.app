"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Eye,
  X,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  Paperclip,
} from "lucide-react";
import PostalMime from "postal-mime";
import { urlFirmada } from "@/lib/actions/storage";

// Formatos que el navegador previsualiza directamente en un <iframe>.
const PREVISUALIZABLE = ["pdf", "png", "jpg", "jpeg", "webp", "gif", "svg", "txt"];

interface EmailParseado {
  from?: { name?: string; address?: string } | null;
  to?: { name?: string; address?: string }[] | null;
  subject?: string | null;
  date?: string | null;
  html?: string | null;
  text?: string | null;
  attachments?: { filename?: string }[];
}

function direccion(p?: { name?: string; address?: string } | null): string {
  if (!p) return "—";
  return p.name ? `${p.name} <${p.address ?? ""}>` : p.address ?? "—";
}

export default function VisorDocumento({
  bucket,
  path,
  nombre,
  label = "Ver",
  className,
}: {
  bucket: "documentos" | "ordenes-oc";
  path: string;
  nombre: string;
  label?: string;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [eml, setEml] = useState<EmailParseado | null>(null);
  const [emlPending, setEmlPending] = useState(false);

  const ext = (path.split(".").pop() ?? "").toLowerCase();
  const esEml = ext === "eml";
  const inline = PREVISUALIZABLE.includes(ext);

  function abrir() {
    setAbierto(true);
    if (!url) start(async () => setUrl(await urlFirmada(bucket, path)));
  }

  // Descarga y parsea el .eml (correo MIME) para mostrarlo legible.
  useEffect(() => {
    if (!url || !esEml || eml) return;
    let cancelado = false;
    setEmlPending(true);
    (async () => {
      try {
        const resp = await fetch(url);
        const buf = await resp.arrayBuffer();
        const parsed = (await PostalMime.parse(buf)) as EmailParseado;
        if (!cancelado) setEml(parsed);
      } catch {
        /* se muestra el aviso de error abajo */
      } finally {
        if (!cancelado) setEmlPending(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [url, esEml, eml]);

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className={
          className ??
          "inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-muted transition-colors hover:text-primary"
        }
      >
        <Eye className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {label}
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
          onClick={() => setAbierto(false)}
        >
          <div
            className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-raised"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera */}
            <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
              <FileText className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} aria-hidden />
              <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                {nombre}
              </p>
              {url && (
                <>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    Pestaña
                  </a>
                  <a
                    href={url}
                    download={nombre}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    Descargar
                  </a>
                </>
              )}
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
                className="rounded-md p-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>

            {/* Cuerpo */}
            <div className="min-h-0 flex-1 bg-canvas">
              {pending && !url ? (
                <div className="flex h-full items-center justify-center text-muted">
                  <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2} aria-hidden />
                </div>
              ) : !url ? (
                <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-muted">
                  No se pudo abrir el documento.
                </div>
              ) : esEml ? (
                emlPending ? (
                  <div className="flex h-full items-center justify-center text-muted">
                    <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2} aria-hidden />
                  </div>
                ) : eml ? (
                  <div className="flex h-full flex-col">
                    <div className="space-y-1 border-b border-line bg-surface px-5 py-3 text-[13px]">
                      <p className="text-[15px] font-semibold text-ink">
                        {eml.subject || "(sin asunto)"}
                      </p>
                      <p className="text-muted">
                        <span className="text-ink-soft">De:</span> {direccion(eml.from)}
                      </p>
                      <p className="text-muted">
                        <span className="text-ink-soft">Para:</span>{" "}
                        {(eml.to ?? []).map(direccion).join(", ") || "—"}
                      </p>
                      {eml.date && (
                        <p className="text-muted">
                          <span className="text-ink-soft">Fecha:</span>{" "}
                          {new Date(eml.date).toLocaleString("es-DO")}
                        </p>
                      )}
                      {eml.attachments && eml.attachments.length > 0 && (
                        <p className="flex flex-wrap items-center gap-1.5 pt-1 text-muted">
                          <Paperclip className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                          {eml.attachments.map((a, i) => (
                            <span
                              key={i}
                              className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-soft"
                            >
                              {a.filename || "adjunto"}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                    {eml.html ? (
                      <iframe
                        title={nombre}
                        sandbox=""
                        srcDoc={eml.html}
                        className="min-h-0 flex-1 bg-white"
                      />
                    ) : (
                      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap px-5 py-4 text-[13px] text-ink-soft">
                        {eml.text || "(correo sin contenido)"}
                      </pre>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                    <Mail className="h-10 w-10 text-muted" strokeWidth={1.5} aria-hidden />
                    <p className="text-[13px] text-ink-soft">
                      No se pudo leer el correo. Descárgalo para abrirlo.
                    </p>
                    <a
                      href={url}
                      download={nombre}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-ink transition-colors hover:bg-primary-hover"
                    >
                      <Download className="h-4 w-4" strokeWidth={2} aria-hidden />
                      Descargar
                    </a>
                  </div>
                )
              ) : inline ? (
                <iframe src={url} title={nombre} className="h-full w-full" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                  <FileText className="h-10 w-10 text-muted" strokeWidth={1.5} aria-hidden />
                  <p className="text-[13px] text-ink-soft">
                    Este formato (.{ext}) no se previsualiza en el navegador.
                  </p>
                  <a
                    href={url}
                    download={nombre}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-ink transition-colors hover:bg-primary-hover"
                  >
                    <Download className="h-4 w-4" strokeWidth={2} aria-hidden />
                    Descargar para abrir
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
