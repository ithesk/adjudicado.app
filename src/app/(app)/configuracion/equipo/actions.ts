"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireMiembro } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemo } from "@/lib/demo";
import type { Miembro } from "@/lib/types";

export type InviteState = { error?: string; ok?: string };

async function origenActual(): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") || "https";
  if (host) return `${proto}://${host}`;
  // Sin header host (raro): usa la URL configurada del despliegue.
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

// Invita por correo. Si el correo YA existe (usuario fantasma o de otra empresa),
// lo agrega a esta empresa y le manda un enlace de acceso. Auto-resuelve.
async function invitarOAgregar(
  email: string,
  rol: string,
  miembro: Miembro,
  origin: string,
): Promise<InviteState> {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      invite_org_id: miembro.org_id,
      invite_org_nombre: miembro.organizacion?.nombre,
      invite_rol: rol,
    },
    redirectTo: `${origin}/auth/confirm?next=/bienvenida`,
  });

  if (!error) {
    return { ok: `Invitación enviada a ${email}. Le llegará un correo.` };
  }
  if (!/registered|already exists|been registered/i.test(error.message)) {
    return { error: "No se pudo enviar: " + error.message };
  }

  // Ya existe → localizarlo, agregarlo a la empresa y mandarle acceso.
  const { data: list } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const u = (list?.users ?? []).find(
    (x) => (x.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  if (!u) return { error: "Ese correo ya existe pero no pude localizarlo." };

  const { data: existe } = await admin
    .from("miembro")
    .select("id")
    .eq("org_id", miembro.org_id)
    .eq("user_id", u.id)
    .maybeSingle();
  if (existe) return { error: `${email} ya es miembro de tu empresa.` };

  await admin.from("miembro").insert({
    org_id: miembro.org_id,
    user_id: u.id,
    nombre: (u.user_metadata?.nombre as string) || email,
    rol,
  });
  // Enlace de acceso (recovery → crea/define contraseña y entra).
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email);

  return {
    ok: `${email} ya tenía cuenta: lo agregué a ${
      miembro.organizacion?.nombre ?? "tu empresa"
    } y le envié un enlace para acceder.`,
  };
}

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
  const r = await invitarOAgregar(email, rol, miembro, await origenActual());
  if (r.ok) revalidatePath("/configuracion/equipo");
  return r;
}

export async function reenviarInvitacion(
  email: string,
  rol: string,
): Promise<InviteState> {
  if (isDemo()) return { ok: "(demo) reenviado." };
  const miembro = await requireMiembro();
  const r = await invitarOAgregar(
    email,
    rol || "colaborador",
    miembro,
    await origenActual(),
  );
  if (r.ok) revalidatePath("/configuracion/equipo");
  // Mensaje específico de reenvío si fue invitación nueva.
  if (r.ok && r.ok.startsWith("Invitación enviada"))
    return { ok: `Reenviado a ${email}.` };
  return r;
}

export async function cancelarInvitacion(userId: string): Promise<InviteState> {
  if (isDemo()) return {};
  await requireMiembro();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: "No se pudo cancelar: " + error.message };
  revalidatePath("/configuracion/equipo");
  return { ok: "Invitación cancelada." };
}
