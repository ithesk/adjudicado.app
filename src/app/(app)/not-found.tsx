// Qué se ve al abrir algo que ya no existe.
//
// Cuatro pantallas llaman a notFound(): una orden, una licitación, una
// entidad o una plantilla borradas. El caso REAL es abrir un enlace que un
// compañero acaba de eliminar, o volver a una pestaña vieja. Hasta ahora eso
// tiraba a la pantalla por defecto de Next: en blanco y en inglés.
//
// Vive dentro de (app), así que conserva el menú: no se sale de la app.

import Link from "next/link";
import { FileQuestion, LayoutList, Gavel } from "lucide-react";
import { Hoja, btnPrimary, btnGhost } from "@/components/ui";

export default function NoEncontradoApp() {
  return (
    <Hoja ancho="lista">
      <div className="mt-10 rounded-lg border border-line bg-surface p-8 text-center shadow-card">
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-surface-2">
          <FileQuestion className="h-6 w-6 text-muted" strokeWidth={2} aria-hidden />
        </span>
        <h1 className="font-display text-lg font-semibold text-ink">
          Esto ya no está
        </h1>
        <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted">
          La orden, licitación o ficha que buscabas no existe o se eliminó.
          Puede que el enlace sea viejo, o que alguien del equipo la haya
          borrado.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Link href="/" className={btnPrimary()}>
            <LayoutList className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            Ir a la bandeja
          </Link>
          <Link href="/licitaciones" className={btnGhost()}>
            <Gavel className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            Ver licitaciones
          </Link>
        </div>
      </div>
    </Hoja>
  );
}
