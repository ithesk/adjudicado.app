"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/configuracion", label: "Suplidores", exact: true },
  { href: "/configuracion/canales", label: "Canales", exact: false },
  { href: "/configuracion/equipo", label: "Equipo", exact: false },
  { href: "/configuracion/grupos", label: "Grupos", exact: false },
  { href: "/configuracion/integraciones", label: "Integraciones", exact: false },
];

export default function ConfigTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-line">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
              active
                ? "border-primary text-ink"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
