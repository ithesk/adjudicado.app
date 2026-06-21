"use server";

import { headers } from "next/headers";
import { requireMiembro } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemo } from "@/lib/demo";

export type InviteState = { error?: string; ok?: string };

// Invita a un colega por correo: le llega un email con un link que lo mete a
// esta empresa (vía Supabase inviteUserByEmail + /auth/confirm).
export async function invitarMiembro(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const rol = String(formData.get("rol") || "colaborador");
  if (!email || !email.includes("@")) {
    return { error: "Escribe un correo válido." };
  }
  if (isDemo()) {
    return { ok: `(demo) Se enviaría una invitación a ${email}.` };
  }

  const miembro = await requireMiembro();
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") || "https";
  const origin = host ? `${proto}://${host}` : "https://adjudicado-app.vercel.app";

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      invite_org_id: miembro.org_id,
      invite_org_nombre: miembro.organizacion?.nombre,
      invite_rol: rol,
    },
    redirectTo: `${origin}/auth/confirm?next=/`,
  });

  if (error) {
    return {
      error:
        "No se pudo enviar: " +
        error.message +
        ". Si esa persona ya tiene cuenta, que entre y use el código.",
    };
  }
  return { ok: `Invitación enviada a ${email}. Le llegará un correo.` };
}
