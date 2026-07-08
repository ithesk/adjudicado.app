"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";

export async function cerrarSesion() {
  if (isDemo()) redirect("/tablero");
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
