"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
      className={`flex items-center gap-2.5 rounded-[11px] px-2.5 py-1.5 text-[13px] transition-colors ${
        active
          ? "bg-primary/10 font-semibold text-primary"
          : "text-ink-soft hover:bg-surface-2"
      }`}
    >
      <span className={active ? "text-primary" : "text-muted"}>{icon}</span>
      {children}
    </Link>
  );
}
