"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/licitaciones", label: "Procesos", exact: false },
  { href: "/licitaciones/empresa", label: "Empresa", exact: false },
];

export default function LicitacionesTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-line">
      {TABS.map((t) => {
        // "Procesos" cubre también /nuevo y /[id]; Empresa es exacta.
        const active =
          t.href === "/licitaciones"
            ? pathname.startsWith("/licitaciones") &&
              !pathname.startsWith("/licitaciones/empresa")
            : pathname.startsWith(t.href);
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
