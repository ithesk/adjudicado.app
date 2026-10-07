"use client";

// Dos piezas del cotizador para la OFERTA TÉCNICA:
//
// - ImagenItem: la foto del producto de la línea (algunas entidades la
//   piden). Miniatura con «cambiar» y «quitar»; sin imagen, un botón
//   discreto. Sube por server action (tope 4 MB: Vercel corta en 4,5).
//
// - DescripcionOfertada: la descripción de lo ofertado en VARIAS líneas. Era
//   un <input> de una línea: al editar en la Bid Room una descripción que
//   trajo el análisis (resumen + un punto de cumplimiento por línea) los
//   saltos se perdían al guardar y la oferta técnica se quedaba sin sus ✓.

import { useLayoutEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, X } from "lucide-react";
import { avisoError } from "@/lib/avisos";
import { quitarImagenItemAction, subirImagenItemAction } from "@/lib/actions/licitaciones";

const MAX_MB = 4;

export function ImagenItem({ itemId, url }: { itemId: string; url: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [ocupado, startTransition] = useTransition();

  function subir(archivo: File) {
    if (archivo.size > MAX_MB * 1024 * 1024) {
      avisoError(`La imagen pesa más de ${MAX_MB} MB.`);
      return;
    }
    const fd = new FormData();
    fd.append("imagen", archivo);
    startTransition(async () => {
      const error = await subirImagenItemAction(itemId, fd);
      if (error) avisoError(error);
      router.refresh();
    });
  }

  function quitar() {
    if (!confirm("¿Quitar la imagen de este producto?")) return;
    startTransition(async () => {
      const error = await quitarImagenItemAction(itemId);
      if (error) avisoError(error);
      router.refresh();
    });
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) subir(f);
          e.target.value = "";
        }}
      />
      {url ? (
        <span className="group/img relative inline-flex flex-none">
          <button
            type="button"
            onClick={() => input.current?.click()}
            title="Imagen del producto (sale en la oferta técnica) — clic para cambiarla"
            className="block h-8 w-8 overflow-hidden rounded border border-line bg-surface"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Supabase */}
            <img src={url} alt="" className="h-full w-full object-contain" />
          </button>
          <button
            type="button"
            onClick={quitar}
            disabled={ocupado}
            aria-label="Quitar imagen"
            className="absolute -right-1.5 -top-1.5 hidden rounded-full border border-line bg-surface p-0.5 text-muted hover:text-danger group-hover/img:block"
          >
            <X className="h-2.5 w-2.5" strokeWidth={2.4} />
          </button>
          {ocupado && (
            <Loader2 className="absolute inset-0 m-auto h-3.5 w-3.5 text-primary motion-safe:animate-spin" aria-hidden />
          )}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={ocupado}
          title="Agregar imagen del producto (para la oferta técnica)"
          className="flex flex-none items-center gap-1 whitespace-nowrap text-[11.5px] font-medium text-muted transition-colors hover:text-primary"
        >
          {ocupado ? (
            <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden />
          ) : (
            <ImagePlus className="h-3 w-3" strokeWidth={2} aria-hidden />
          )}
          Imagen
        </button>
      )}
    </>
  );
}

export function DescripcionOfertada({
  valor,
  className,
  onGuardar,
}: {
  valor: string | null;
  className: string;
  onGuardar: (v: string | null) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function ajustar() {
    const t = ref.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${t.scrollHeight + 2}px`;
  }
  useLayoutEffect(ajustar, [valor]);

  return (
    <textarea
      ref={ref}
      rows={1}
      defaultValue={valor ?? ""}
      placeholder={"Descripción de lo ofertado (afirmativa)\nuna línea por punto: «RAM: 16 GB (req. mín. 16 GB)»"}
      onInput={ajustar}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v !== (valor ?? "").trim()) onGuardar(v || null);
      }}
      className={`${className} resize-none leading-snug`}
    />
  );
}
