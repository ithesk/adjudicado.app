import { Mail, Phone } from "lucide-react";
import { Avatar } from "@/components/ui";
import type { Contacto } from "@/lib/types";

// Lista de contactos reutilizable (suplidores e instituciones).
// email → enlace mailto, teléfono → enlace tel.
export function ContactList({
  contactos,
  dense = false,
}: {
  contactos: Contacto[];
  dense?: boolean;
}) {
  if (contactos.length === 0) {
    return <p className="text-[13px] text-muted">Sin contactos.</p>;
  }
  return (
    <ul className="divide-y divide-line">
      {contactos.map((c) => (
        <li
          key={c.id}
          className={`flex items-start gap-3 ${dense ? "py-2" : "py-2.5"}`}
        >
          <Avatar nombre={c.nombre} size={28} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ink">
              {c.nombre}
            </p>
            {c.rol && (
              <p className="truncate text-[11px] text-muted">{c.rol}</p>
            )}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {c.email && (
                <a
                  href={`mailto:${c.email}`}
                  className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
                >
                  <Mail className="h-3 w-3" strokeWidth={2} aria-hidden />
                  {c.email}
                </a>
              )}
              {c.telefono && (
                <a
                  href={`tel:${c.telefono}`}
                  className="inline-flex items-center gap-1 text-[12px] text-ink-soft hover:text-ink"
                >
                  <Phone className="h-3 w-3" strokeWidth={2} aria-hidden />
                  {c.telefono}
                </a>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
