"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string };

// Una sola acción que ramifica según el campo oculto `modo`. Evita el bug de
// cambiar la función pasada a useActionState (que puede quedarse con la vieja).
export async function autenticar(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const modo = String(formData.get("modo") || "entrar");
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  if (!email || !password) return { error: "Escribe correo y contraseña." };

  const supabase = await createClient();

  if (modo === "crear") {
    if (password.length < 6)
      return { error: "La contraseña debe tener al menos 6 caracteres." };
    const nombre = String(formData.get("nombre") || "").trim();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nombre } },
    });
    if (error) return { error: error.message };

    // Sin sesión = correo ya registrado (Supabase oculta la enumeración) o
    // confirmación por correo activa.
    if (!data.session) {
      return {
        error:
          "Ese correo ya tiene cuenta o necesita confirmación. Intenta entrar.",
      };
    }
    redirect("/onboarding");
  }

  // entrar
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Credenciales incorrectas." };
  redirect("/");
}
