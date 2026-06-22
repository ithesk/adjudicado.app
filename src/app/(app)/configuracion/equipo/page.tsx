import { Mail } from "lucide-react";
import { requireMiembro } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listarPendientes } from "@/lib/queries";
import { demoMiembros, isDemo } from "@/lib/demo";
import { formatFecha, type Miembro } from "@/lib/types";
import { Panel, Avatar } from "@/components/ui";
import InvitarForm from "./InvitarForm";
import BotonesInvitacion from "./BotonesInvitacion";

export const dynamic = "force-dynamic";

export default async function EquipoPage() {
  const miembro = await requireMiembro();
  const pendientes = await listarPendientes();

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
      </Panel>

      {pendientes.length > 0 && (
        <Panel>
          <p className="border-b border-line px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted">
            Invitaciones pendientes · {pendientes.length}
          </p>
          <ul className="divide-y divide-line">
            {pendientes.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
                  <Mail className="h-4 w-4" strokeWidth={2} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{p.email}</p>
                  <p className="text-xs text-muted">
                    Invitado{" "}
                    {p.invited_at ? formatFecha(p.invited_at.slice(0, 10)) : ""}{" "}
                    · sin aceptar
                  </p>
                </div>
                <BotonesInvitacion email={p.email} id={p.id} />
              </li>
            ))}
          </ul>
        </Panel>
      )}

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
