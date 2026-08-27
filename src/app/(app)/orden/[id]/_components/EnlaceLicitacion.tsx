"use client";

// De qué LICITACIÓN salió esta orden de compra.
//
// El enlace se hace solo por el código de expediente cuando la orden nace.
// Pero la peculiaridad del negocio es que muchas licitaciones se trabajan
// FUERA de este sistema y la orden llega igual por correo: por eso «sin
// licitación» es un estado legítimo y frecuente (28 de 33 hoy), no un hueco
// que haya que rellenar. Se muestra sin alarma, con la opción de enlazarla a
// mano si el pliego se registra después.

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gavel, Link2, Loader2, X } from "lucide-react";
import { Panel, SectionTitle, btnGhost } from "@/components/ui";
import { avisoError, avisoOk } from "@/lib/avisos";
import { coincideTexto } from "@/lib/buscar-texto";
import { ESTADO_LIC_CHIP, ESTADO_LIC_LABEL, type EstadoLicitacion } from "@/lib/licitaciones/tipos";
import { enlazarOrdenAProceso } from "../actions";

export interface ProcesoEnlazable {
  id: string;
  codigo: string;
  objeto: string | null;
  estado: EstadoLicitacion;
}

export default function EnlaceLicitacion({
  ordenId,
  codigoExpediente,
  proceso,
  candidatos,
}: {
  ordenId: string;
  codigoExpediente: string | null;
  /** La licitación enlazada, si la hay. */
  proceso: ProcesoEnlazable | null;
  /** Procesos de la org, para enlazar a mano. */
  candidatos: ProcesoEnlazable[];
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [buscando, setBuscando] = useState(false);
  const [q, setQ] = useState("");

  function enlazar(procesoId: string | null, nombre?: string) {
    startTransition(async () => {
      const error = await enlazarOrdenAProceso(ordenId, procesoId);
      if (error) {
        avisoError(error);
        return;
      }
      avisoOk(procesoId ? `Enlazada con ${nombre}.` : "Enlace quitado.");
      setBuscando(false);
      setQ("");
      router.refresh();
    });
  }

  const filtrados = q.trim()
    ? candidatos.filter((p) => coincideTexto(`${p.codigo} ${p.objeto ?? ""}`, q)).slice(0, 8)
    : candidatos.slice(0, 8);

  return (
    <Panel>
      <SectionTitle icon={Gavel}>Licitación de origen</SectionTitle>
      <div className="px-4 py-3">
        {proceso ? (
          <>
            <Link
              href={`/licitaciones/${proceso.id}`}
              prefetch={false}
              className="block rounded-md border border-line px-2.5 py-2 transition-colors hover:border-line-strong hover:bg-surface-2"
            >
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[12.5px] font-medium text-ink">
                  {proceso.codigo}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium ${ESTADO_LIC_CHIP[proceso.estado].chip}`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${ESTADO_LIC_CHIP[proceso.estado].dot}`}
                    aria-hidden
                  />
                  {ESTADO_LIC_LABEL[proceso.estado]}
                </span>
              </span>
              {proceso.objeto && (
                <span className="mt-0.5 block truncate text-[12px] text-muted">
                  {proceso.objeto}
                </span>
              )}
            </Link>
            <button
              type="button"
              onClick={() => enlazar(null)}
              disabled={pendiente}
              className="mt-1.5 text-[11.5px] text-muted transition-colors hover:text-danger"
            >
              Quitar el enlace
            </button>
          </>
        ) : (
          <>
            <p className="text-[12.5px] leading-snug text-muted">
              Esta orden no viene de ninguna licitación registrada aquí.
              {codigoExpediente ? (
                <>
                  {" "}Su expediente es{" "}
                  <span className="font-mono text-ink-soft">{codigoExpediente}</span> y no
                  cruza con ninguna del sistema — normal si el pliego se trabajó fuera.
                </>
              ) : (
                " No tiene código de expediente, así que no se pudo buscar."
              )}
            </p>
            {!buscando ? (
              <button
                type="button"
                onClick={() => setBuscando(true)}
                className={btnGhost("mt-2 !px-2.5 !py-1 !text-[12px]")}
              >
                <Link2 className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
                Enlazar a una licitación
              </button>
            ) : (
              <div className="mt-2">
                <span className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Buscar por código u objeto…"
                    className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setBuscando(false);
                      setQ("");
                    }}
                    className="rounded p-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                    aria-label="Cancelar"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.2} />
                  </button>
                </span>
                <ul className="mt-1.5 divide-y divide-line overflow-hidden rounded-md border border-line">
                  {filtrados.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={pendiente}
                        onClick={() => enlazar(p.id, p.codigo)}
                        className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-55"
                      >
                        {pendiente ? (
                          <Loader2 className="mt-0.5 h-3 w-3 flex-none motion-safe:animate-spin text-muted" strokeWidth={2.2} aria-hidden />
                        ) : null}
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-[12px] font-medium text-ink">
                            {p.codigo}
                          </span>
                          <span className="block truncate text-[11.5px] text-muted">
                            {ESTADO_LIC_LABEL[p.estado]}
                            {p.objeto ? ` · ${p.objeto}` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                  {filtrados.length === 0 && (
                    <li className="px-2.5 py-2 text-[11.5px] text-muted">
                      Ninguna licitación coincide.
                    </li>
                  )}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
