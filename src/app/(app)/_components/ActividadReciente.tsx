import Link from "next/link";
import {
  Phone,
  Mail,
  StickyNote,
  Package,
  Activity,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui";
import { tiempoRelativo } from "@/lib/types";
import type { ActividadGlobal } from "@/lib/queries";

const ICON: Record<string, { icon: LucideIcon; tono: string }> = {
  llamada: { icon: Phone, tono: "text-primary" },
  correo: { icon: Mail, tono: "text-primary" },
  nota: { icon: StickyNote, tono: "text-muted" },
  suplidor: { icon: Package, tono: "text-warn" },
  evento: { icon: Activity, tono: "text-muted" },
};

export default function ActividadReciente({
  actividad,
}: {
  actividad: ActividadGlobal[];
}) {
  if (actividad.length === 0) return null;
  const recientes = actividad.slice(0, 6);

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-muted">
          <Activity className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Actividad reciente
        </h2>
        <Link
          href="/actividad"
          className="inline-flex items-center gap-0.5 text-[12px] font-medium text-muted transition-colors hover:text-primary"
        >
          Ver toda
          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
        <ul className="divide-y divide-line">
          {recientes.map((a) => {
            const m = ICON[a.tipo] ?? ICON.nota;
            const Icon = m.icon;
            return (
              <li key={a.id}>
                <Link
                  href={`/orden/${a.ordenId}`}
                  className="flex items-center gap-2.5 px-3.5 py-2 transition-colors hover:bg-surface-2"
                >
                  <Avatar nombre={a.autor?.nombre} size={22} />
                  <span className="shrink-0 text-[12px] font-medium text-ink">
                    {a.autor?.nombre ??
                      (a.tipo === "evento" ? "Sistema" : "Miembro")}
                  </span>
                  <Icon
                    className={`h-3 w-3 shrink-0 ${m.tono}`}
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-soft">
                    {a.texto}
                  </span>
                  {a.itemNombre && (
                    <span
                      className="hidden shrink-0 items-center gap-1 truncate rounded bg-surface-2 px-1.5 py-px text-[10px] font-medium text-muted sm:inline-flex sm:max-w-[10rem]"
                      title={a.itemNombre}
                    >
                      <Package className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
                      {a.itemNombre}
                    </span>
                  )}
                  <span className="hidden shrink-0 font-mono text-[11px] text-muted sm:inline">
                    {a.numeroOc || ""}
                  </span>
                  <time className="shrink-0 text-[11px] text-muted">
                    {tiempoRelativo(a.created_at)}
                  </time>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
