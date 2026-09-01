"use client";

// Qué se ve cuando algo revienta DENTRO de la app.
//
// Antes no existía: un error al pintar cualquier página —una orden que un
// compañero acaba de borrar, un hipo de Supabase— tiraba al usuario a la
// pantalla por defecto de Next, en blanco, en inglés, sin menú y sin forma
// de volver. Salías de la aplicación entera por un fallo pasajero.
//
// Al vivir dentro de (app), esto se pinta CON el menú y la barra de alertas:
// el error ocupa el contenido, no la ventana. Y siempre hay dos salidas —
// reintentar aquí mismo, o volver a la bandeja.

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, LayoutList, RotateCw } from "lucide-react";
import { Hoja, btnPrimary, btnGhost } from "@/components/ui";

export default function ErrorApp({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // A los registros del servidor, que es donde se puede investigar.
    console.error("Error en la app:", error);
  }, [error]);

  return (
    <Hoja ancho="lista">
      <div className="mt-10 rounded-lg border border-line bg-surface p-8 text-center shadow-card">
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-danger-soft">
          <AlertTriangle className="h-6 w-6 text-danger" strokeWidth={2} aria-hidden />
        </span>
        <h1 className="font-display text-lg font-semibold text-ink">
          Algo falló al cargar esta pantalla
        </h1>
        <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted">
          No se perdió nada de lo que ya estaba guardado. Suele ser cosa de un
          momento: reintenta y, si vuelve a pasar, avísanos con el código de
          abajo.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={reset} className={btnPrimary()}>
            <RotateCw className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            Reintentar
          </button>
          <Link href="/" className={btnGhost()}>
            <LayoutList className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            Volver a la bandeja
          </Link>
        </div>

        {/* El digest es lo único que permite encontrar ESTE error entre los
            registros del servidor. Sin él, un reporte no se puede rastrear. */}
        {error.digest && (
          <p className="mt-5 font-mono text-[11px] text-muted">
            código: {error.digest}
          </p>
        )}
      </div>
    </Hoja>
  );
}
