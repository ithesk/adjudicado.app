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

// Reenvía la invitación a un correo pendiente. Devuelve resultado para feedback.
export async function reenviarInvitacion(
  email: string,
  rol: string,
): Promise<InviteState> {
  if (isDemo()) return { ok: "(demo) reenviado." };
  const miembro = await requireMiembro();
  const { error } = await enviarInvite(
    email,
    rol || "colaborador",
    miembro,
    await origenActual(),
  );
  if (error) {
    const msg = /security|seconds|rate/i.test(error.message)
      ? "Espera unos segundos antes de reenviar a ese correo."
      : "No se pudo reenviar: " + error.message;
    return { error: msg };
  }
  revalidatePath("/configuracion/equipo");
  return { ok: `Reenviado a ${email}.` };
}

// Cancela una invitación pendiente (borra el usuario invitado no confirmado).
export async function cancelarInvitacion(userId: string): Promise<InviteState> {
  if (isDemo()) return {};
  await requireMiembro();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: "No se pudo cancelar: " + error.message };
  revalidatePath("/configuracion/equipo");
  return { ok: "Invitación cancelada." };
}
