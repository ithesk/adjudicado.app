"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fijarOrgActiva } from "@/lib/actions/org";

export type AuthState = { error?: string };

// Entrar, o crear cuenta. Crear cuenta SIEMPRE abre una empresa nueva (eres
// admin). Unirse a una empresa existente es solo por invitación de correo.
export async function autenticar(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const modo = String(formData.get("modo") || "entrar");
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  if (!email || !password) return { error: "Escribe correo y contraseña." };

  const supabase = await createClient();

  // ---------- ENTRAR ----------
  if (modo !== "crear") {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: "Credenciales incorrectas." };
    redirect("/");
  }

  // ---------- CREAR CUENTA (= crear empresa) ----------
  if (password.length < 6)
    return { error: "La contraseña debe tener al menos 6 caracteres." };
  const nombre = String(formData.get("nombre") || "").trim();
  const empresa = String(formData.get("empresa") || "").trim();
  if (!empresa) return { error: "Escribe el nombre de tu empresa." };

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

  const admin = createAdminClient();
  const { data: org, error: e1 } = await admin
    .from("organizacion")
    .insert({ nombre: empresa })
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
  redirect("/");
}
