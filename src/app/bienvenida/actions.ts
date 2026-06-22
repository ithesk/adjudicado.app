"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ClaveState = { error?: string };

export async function establecerClave(
  _prev: ClaveState,
  formData: FormData,
): Promise<ClaveState> {
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (password.length < 6)
    return { error: "La contraseña debe tener al menos 6 caracteres." };
  if (password !== confirm) return { error: "Las contraseñas no coinciden." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect("/");
}
