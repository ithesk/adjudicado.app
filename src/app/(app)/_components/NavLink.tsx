"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";

// Pista de navegación pendiente: si el destino tarda (ruta dinámica sin
// prefetch listo), un spinner discreto aparece EN el ítem clicado. Tamaño
// fijo siempre presente (sin saltos de layout) y con retardo de 150 ms para
// no parpadear cuando la navegación es instantánea.
function PistaNav() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`ml-auto inline-grid h-3.5 w-3.5 flex-none place-items-center transition-opacity delay-150 duration-200 ${
        pending ? "opacity-100" : "opacity-0"
      }`}
    >
      <Loader2 className="h-3 w-3 motion-safe:animate-spin" strokeWidth={2.2} />
    </span>
  );
}

export default function NavLink({
  href,
  icon,
  children,
  exact = false,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      prefetch={false}
      className={`flex items-center gap-2.5 rounded-[11px] px-2.5 py-1.5 text-[13px] transition-colors ${
        active
          ? "bg-primary/10 font-semibold text-primary"
          : "text-ink-soft hover:bg-surface-2"
      }`}
    >
      <span className={active ? "text-primary" : "text-muted"}>{icon}</span>
      {children}
      <PistaNav />
    </Link>
  );
}
