"use client";

// Duplicar una licitación: el pliego nuevo nace con todo el trabajo del viejo
// y solo cambia el código. Se usa en DOS sitios (la cabecera de la ficha y
// cada fila de la lista), por eso vive aquí y no dentro de ninguno de los dos.
//
// Solo pide UNA cosa —el código nuevo— porque es lo único que de verdad
// cambia entre dos pliegos parecidos. El resto se ajusta después, ya dentro
// del proceso creado, que es donde se ve lo que se está tocando.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2 } from "lucide-react";
import { btnPrimary, btnGhost } from "@/components/ui";
import { avisoError, avisoOk } from "@/lib/avisos";
import { duplicarProcesoAction } from "@/lib/actions/licitaciones";

const inputSm =
  "w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus:border-primary";

export default function DuplicarProceso({
  procesoId,
  codigoActual,
  // "boton" = con texto, para la cabecera de la ficha.
  // "icono" = solo el icono, para no ensanchar las filas de la lista.
  variante = "boton",
}: {
  procesoId: string;
  codigoActual: string;
  variante?: "boton" | "icono";
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (abierto) inputRef.current?.focus();
  }, [abierto]);

  // Escape cierra mientras no se esté guardando (cortar a medias dejaría al
  // usuario sin saber si el proceso se creó).
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !ocupado) setAbierto(false);
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierto, ocupado]);

  async function duplicar() {
    const limpio = codigo.trim();
    if (!limpio) return;
    setOcupado(true);
    try {
      const r = await duplicarProcesoAction(procesoId, limpio);
      if (r.error || !r.id) {
        avisoError(r.error ?? "No se pudo duplicar.");
        return;
      }
      avisoOk(`Creado ${limpio} con los datos de ${codigoActual}.`);
      setAbierto(false);
      setCodigo("");
      // Al proceso nuevo: es lo que se quiere tocar ahora, no el viejo.
      router.push(`/licitaciones/${r.id}`);
    } catch (e) {
      avisoError(e instanceof Error ? e.message : "No se pudo duplicar.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title={`Duplicar ${codigoActual} en un proceso nuevo`}
        className={
          variante === "icono"
            ? "rounded p-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            : btnGhost("!px-2.5 !py-1.5 !text-[12.5px]")
        }
        aria-label={variante === "icono" ? `Duplicar ${codigoActual}` : undefined}
      >
        <Copy className={variante === "icono" ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={2.2} aria-hidden />
        {variante === "boton" && "Duplicar"}
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Duplicar licitación"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !ocupado) setAbierto(false);
          }}
        >
          <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-4 shadow-raised">
            <h2 className="text-[14px] font-semibold text-ink">Duplicar licitación</h2>
            <p className="mt-1 text-[12.5px] leading-snug text-muted">
              El proceso nuevo nace con la entidad, el objeto, los ítems y su
              costeo, y el checklist de requisitos de{" "}
              <span className="font-mono text-ink-soft">{codigoActual}</span>.
            </p>

            <label className="mt-3 block">
              <span className="mb-1 block text-[11.5px] font-medium text-ink-soft">
                Código del proceso nuevo
              </span>
              <input
                ref={inputRef}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void duplicar();
                  }
                }}
                placeholder="INSTITUCION-CCC-CP-2026-0001"
                className={`${inputSm} font-mono`}
                disabled={ocupado}
              />
            </label>

            {/* Que no sorprenda después: se dice ANTES de crear nada. */}
            <p className="mt-2.5 rounded-md bg-warn-soft px-2.5 py-1.5 text-[11.5px] leading-snug text-warn">
              La cotización se copia tal cual — revísala antes de someter. Los
              documentos ya generados no se copian (llevan impreso el código
              viejo), así que esos requisitos quedan pendientes.
            </p>

            <div className="mt-3.5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                disabled={ocupado}
                className={btnGhost("!px-2.5 !py-1.5 !text-[12.5px]")}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={duplicar}
                disabled={ocupado || !codigo.trim()}
                className={btnPrimary("!px-2.5 !py-1.5 !text-[12.5px]")}
              >
                {ocupado ? (
                  <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" strokeWidth={2.4} aria-hidden />
                ) : (
                  <Copy className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
                )}
                {ocupado ? "Duplicando…" : "Duplicar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
