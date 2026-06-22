"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireMiembro } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemo } from "@/lib/demo";
import type { Miembro } from "@/lib/types";

export type InviteState = { error?: string; ok?: string };

async function origenActual(): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") || "https";
  return host ? `${proto}://${host}` : "https://adjudicado-app.vercel.app";
}

// Lógica compartida de envío de invitación.
async function enviarInvite(
  email: string,
  rol: string,
  miembro: Miembro,
  origin: string,
) {
  const admin = createAdminClient();
  return admin.auth.admin.inviteUserByEmail(email, {
    data: {
      invite_org_id: miembro.org_id,
      invite_org_nombre: miembro.organizacion?.nombre,
      invite_rol: rol,
    },
    redirectTo: `${origin}/auth/confirm?next=/`,
  });
}

// Invita por correo (le llega un email con el enlace).
export async function invitarMiembro(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const rol = String(formData.get("rol") || "colaborador");
  if (!email || !email.includes("@")) return { error: "Escribe un correo válido." };
  if (isDemo()) return { ok: `(demo) Se enviaría una invitación a ${email}.` };

  const miembro = await requireMiembro();
  const { error } = await enviarInvite(
    email,
    rol,
    miembro,
    await origenActual(),
  );
  if (error) {
    return {
      error:
        "No se pudo enviar: " +
        error.message +
        ". Si ya tiene cuenta, que entre con el código.",
    };
  }
  revalidatePath("/configuracion/equipo");
  return { ok: `Invitación enviada a ${email}. Le llegará un correo.` };
}

// Reenvía la invitación a un correo pendiente.
export async function reenviarInvitacion(email: string, rol: string) {
  if (isDemo()) return;
  const miembro = await requireMiembro();
  await enviarInvite(email, rol || "colaborador", miembro, await origenActual());
  revalidatePath("/configuracion/equipo");
}

// Cancela una invitación pendiente (borra el usuario invitado no confirmado).
export async function cancelarInvitacion(userId: string) {
  if (isDemo()) return;
  await requireMiembro();
  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(userId);
  revalidatePath("/configuracion/equipo");
}
