import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { demoMiembro, isDemo } from "@/lib/demo";
import type { Miembro } from "@/lib/types";

export const ORG_COOKIE = "org_activa";

// Devuelve el usuario autenticado o null.
export async function getUser() {
  if (isDemo()) return { id: "demo-user", email: "demo@sk.do" } as const;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// TODAS las empresas a las que pertenece el usuario (un usuario puede estar en
// varias). Cada una con su organización.
export async function getMembresias(): Promise<Miembro[]> {
  if (isDemo()) return [demoMiembro()];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("miembro")
    .select("*, organizacion(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  return (data as Miembro[] | null) ?? [];
}

// La membresía ACTIVA: la org elegida (cookie) o la primera. Mantiene la misma
// forma que antes, así el resto del código no cambia.
export async function getMiembro(): Promise<Miembro | null> {
  const membresias = await getMembresias();
  if (membresias.length === 0) return null;
  const cookieStore = await cookies();
  const activa = cookieStore.get(ORG_COOKIE)?.value;
  return membresias.find((m) => m.org_id === activa) ?? membresias[0];
}

// Exige membresía; si no hay sesión → /login, si no hay empresa → /onboarding.
export async function requireMiembro(): Promise<Miembro> {
  const user = await getUser();
  if (!user) redirect("/login");
  const miembro = await getMiembro();
  if (!miembro) redirect("/onboarding");
  return miembro;
}
