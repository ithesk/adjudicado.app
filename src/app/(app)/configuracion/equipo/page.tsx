import { requireMiembro } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { demoMiembros, isDemo } from "@/lib/demo";
import { formatFecha, type Miembro } from "@/lib/types";
import { Panel } from "@/components/ui";
import { Avatar } from "@/components/ui";
import CodigoInvitacion from "@/components/CodigoInvitacion";
import InvitarForm from "./InvitarForm";

export const dynamic = "force-dynamic";

export default async function EquipoPage() {
  const miembro = await requireMiembro();

  let miembros: Miembro[];
  if (isDemo()) {
    miembros = demoMiembros();
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("miembro")
      .select("*")
      .eq("org_id", miembro.org_id)
      .order("created_at", { ascending: true });
    miembros = (data as Miembro[] | null) ?? [];
  }

  return (
    <div className="space-y-4">
      <Panel className="p-4">
        <h2 className="text-sm font-semibold text-ink">
          Invitar por correo
        </h2>
        <p className="mt-1 mb-3 text-sm text-muted">
          Escribe el correo de tu colega y le llegará un enlace para unirse a{" "}
          {miembro.organizacion?.nombre ?? "tu empresa"}.
        </p>
        <InvitarForm />

        <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-[13px] text-muted hover:text-ink">
            ¿Prefieres un código? (alternativa)
          </summary>
          <p className="mt-2 text-[13px] text-muted">
            Comparte este código; la persona crea su cuenta y elige “Unirme con
            código”.
          </p>
          <CodigoInvitacion codigo={miembro.org_id} />
        </details>
      </Panel>

      <Panel>
        <p className="border-b border-line px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted">
          {miembros.length} {miembros.length === 1 ? "miembro" : "miembros"}
        </p>
        <ul className="divide-y divide-line">
          {miembros.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar nombre={m.nombre} size={32} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {m.nombre || "Sin nombre"}
                </p>
                <p className="text-xs text-muted">
                  Desde {formatFecha(m.created_at.slice(0, 10))}
                </p>
              </div>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">
                {m.rol}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
