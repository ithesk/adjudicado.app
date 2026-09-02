// 404 de las rutas que no existen en absoluto (una URL mal escrita o un
// enlace viejo). Cae FUERA del layout de la app, así que va sola y sin menú:
// el único trabajo aquí es estar en español y ofrecer la vuelta.
//
// El 404 de dentro de la app —una orden o licitación borrada— lo atiende
// (app)/not-found.tsx, que sí conserva el menú.

import Link from "next/link";
import { LogoLockup } from "@/components/Logo";
import { btnPrimary } from "@/components/ui";

export default function NoEncontrado() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm text-center">
        <LogoLockup className="mb-7 justify-center" markSize={30} />
        <h1 className="font-display text-lg font-semibold text-ink">
          Esta página no existe
        </h1>
        <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-relaxed text-muted">
          La dirección no corresponde a ninguna pantalla del sistema. Puede que
          el enlace esté mal escrito o sea de una versión anterior.
        </p>
        <Link href="/" className={btnPrimary("mt-5")}>
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
