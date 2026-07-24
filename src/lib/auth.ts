import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { demoMiembro, isDemo } from "@/lib/demo";
import type { Miembro } from "@/lib/types";

export const ORG_COOKIE = "org_activa";

// TODO lo de este archivo va memoizado con `cache()` de React: se resuelve UNA
// vez por request y las demás llamadas leen el resultado. Sin esto, cada query
// que pedía la membresía repetía `auth.getUser()` — que NO es local, es un
// viaje de red a Supabase para validar el JWT — más el select de `miembro`.
// Un render del layout hacía 5 de esos viajes en fila (requireMiembro,
// getMembresias, listarOrdenes, listarDocsEmpresa…) antes de consultar el
// primer dato real, y cada guardado que refresca la página los pagaba otra vez.
// Esa era la causa de fondo de "el sistema corre pesado".

// Devuelve el usuario autenticado o null.
export const getUser = cache(async () => {
  if (isDemo()) return { id: "demo-user", email: "demo@sk.do" } as const;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

// TODAS las empresas a las que pertenece el usuario (un usuario puede estar en
// varias). Cada una con su organización.
export const getMembresias = cache(async (): Promise<Miembro[]> => {
  if (isDemo()) return [demoMiembro()];
  const user = await getUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("miembro")
    .select("*, organizacion(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  return (data as Miembro[] | null) ?? [];
});

// Solo el org_id activo, SIN viajes de red: lee la cookie. Para lecturas cuyo
// guard real es es_miembro() dentro del RPC/RLS — un org_id falsificado o ajeno
// devuelve vacío en SQL, la cookie no es la frontera de seguridad. Sin cookie
// (primer login) cae a getMiembro() y la deja fijada para las siguientes.
export const orgActivaLigera = cache(async (): Promise<string | null> => {
  if (isDemo()) return demoMiembro().org_id;
  const cookieStore = await cookies();
  const activa = cookieStore.get(ORG_COOKIE)?.value;
  if (activa) return activa;

  const miembro = await getMiembro();
  if (!miembro) return null;
  try {
    // Solo es posible desde una Server Action / route handler; durante el
    // render de una página no se puede escribir cookies y no pasa nada.
    cookieStore.set(ORG_COOKIE, miembro.org_id, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  } catch {}
  return miembro.org_id;
});

// La membresía ACTIVA: la org elegida (cookie) o la primera. Mantiene la misma
// forma que antes, así el resto del código no cambia.
export const getMiembro = cache(async (): Promise<Miembro | null> => {
  const membresias = await getMembresias();
  if (membresias.length === 0) return null;
  const cookieStore = await cookies();
  const activa = cookieStore.get(ORG_COOKIE)?.value;
  return membresias.find((m) => m.org_id === activa) ?? membresias[0];
});

// Exige membresía; si no hay sesión → /login, si no hay empresa → /onboarding.
export async function requireMiembro(): Promise<Miembro> {
  const user = await getUser();
  if (!user) redirect("/login");
  const miembro = await getMiembro();
  if (!miembro) redirect("/onboarding");
  return miembro;
}
