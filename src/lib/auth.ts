import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { demoMiembro, isDemo } from "@/lib/demo";
import type { Miembro } from "@/lib/types";

// Devuelve el usuario autenticado o null.
export async function getUser() {
  if (isDemo()) return { id: "demo-user", email: "demo@sk.do" } as const;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Devuelve la membresía (con organización) del usuario actual, o null.
export async function getMiembro(): Promise<Miembro | null> {
  if (isDemo()) return demoMiembro();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("miembro")
    .select("*, organizacion(*)")
    .eq("user_id", user.id)
    .maybeSingle();

  return (data as Miembro | null) ?? null;
}

// Exige membresía; si no hay sesión → /login, si no hay org → /onboarding.
export async function requireMiembro(): Promise<Miembro> {
  const user = await getUser();
  if (!user) redirect("/login");
  const miembro = await getMiembro();
  if (!miembro) redirect("/onboarding");
  return miembro;
}
