"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fijarOrgActiva } from "@/lib/actions/org";

export type AuthState = { error?: string };

// Una sola acción para entrar y crear cuenta. Crear cuenta es de UN paso:
// usuario + empresa (u "unirse con código") + membresía → directo al tablero.
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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return { error: "Credenciales incorrectas." };
    redirect("/");
  }

  // ---------- CREAR CUENTA ----------
  if (password.length < 6)
    return { error: "La contraseña debe tener al menos 6 caracteres." };

  const nombre = String(formData.get("nombre") || "").trim();
  const tipo = String(formData.get("tipo") || "empresa"); // 'empresa' | 'unir'
  const empresa = String(formData.get("empresa") || "").trim();
  const codigo = String(formData.get("codigo") || "").trim();

  if (tipo === "empresa" && !empresa)
    return { error: "Escribe el nombre de tu empresa." };
  if (tipo === "unir" && !codigo)
    return { error: "Pega el código de invitación de tu empresa." };

  // 1) crear el usuario
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nombre } },
  });
  if (error) return { error: error.message };
  if (!data.session || !data.user) {
    return { error: "Ese correo ya tiene cuenta. Intenta entrar." };
  }

  // 2) crear empresa o unirse (service_role: RLS lo bloquea a propósito)
  const admin = createAdminClient();
  const userId = data.user.id;
  let orgId: string;

  if (tipo === "empresa") {
    const { data: org, error: e1 } = await admin
      .from("organizacion")
      .insert({ nombre: empresa })
      .select("id")
      .single();
    if (e1 || !org) return { error: "No se pudo crear la empresa." };
    const { error: e2 } = await admin.from("miembro").insert({
      org_id: org.id,
      user_id: userId,
      nombre: nombre || email,
      rol: "admin",
    });
    if (e2) return { error: "No se pudo registrar tu membresía." };
    orgId = org.id;
  } else {
    const { data: org } = await admin
      .from("organizacion")
      .select("id")
      .eq("id", codigo)
      .maybeSingle();
    if (!org) return { error: "Código inválido. Pídeselo a un admin." };
    await admin.from("miembro").insert({
      org_id: org.id,
      user_id: userId,
      nombre: nombre || email,
      rol: "colaborador",
    });
    orgId = org.id;
  }

  await fijarOrgActiva(orgId);
  redirect("/");
}
