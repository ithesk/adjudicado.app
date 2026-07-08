"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fijarOrgActiva } from "@/lib/actions/org";
import {
  DIAS_PRUEBA,
  PLAN_POR_DEFECTO,
  esPlanValido,
  type PlanId,
} from "@/lib/planes";

export type RegistroState = { error?: string };

// Registro self-service: crea la cuenta del usuario Y la empresa (queda como
// admin), dejando registrado el plan elegido en la landing y arrancando el
// período de prueba. El cobro real es una capa aparte.
export async function registrar(
  _prev: RegistroState,
  formData: FormData,
): Promise<RegistroState> {
  const nombre = String(formData.get("nombre") || "").trim();
  const empresa = String(formData.get("empresa") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const planRaw = String(formData.get("plan") || "");
  const plan: PlanId = esPlanValido(planRaw) ? planRaw : PLAN_POR_DEFECTO;

  if (!nombre) return { error: "Escribe tu nombre." };
  if (!empresa) return { error: "Escribe el nombre de tu empresa." };
  if (!email || !email.includes("@"))
    return { error: "Escribe un correo válido." };
  if (password.length < 6)
    return { error: "La contraseña debe tener al menos 6 caracteres." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nombre } },
  });
  if (error) return { error: error.message };
  if (!data.session || !data.user) {
    return {
      error:
        "Ese correo ya tiene cuenta. Entra, o revisa tu correo si te invitaron.",
    };
  }

  const trialEndsAt = new Date(
    Date.now() + DIAS_PRUEBA * 24 * 60 * 60 * 1000,
  ).toISOString();

  const admin = createAdminClient();
  const { data: org, error: e1 } = await admin
    .from("organizacion")
    .insert({
      nombre: empresa,
      plan,
      estado_cuenta: "prueba",
      trial_ends_at: trialEndsAt,
    })
    .select("id")
    .single();
  if (e1 || !org) return { error: "No se pudo crear la empresa." };

  const { error: e2 } = await admin.from("miembro").insert({
    org_id: org.id,
    user_id: data.user.id,
    nombre: nombre || email,
    rol: "admin",
  });
  if (e2) return { error: "No se pudo registrar tu membresía." };

  await fijarOrgActiva(org.id);
  redirect("/tablero");
}
