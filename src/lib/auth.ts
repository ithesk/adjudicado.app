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

// El org_id activo para las LECTURAS de los módulos (licitaciones, entidades,
// precios). Delega en getMiembro(), así que la empresa que resuelve es SIEMPRE
// la misma que ven las órdenes.
//
// Antes devolvía la cookie tal cual, sin comprobar que fuera una empresa del
// usuario. La RLS impedía que eso fuera un agujero de seguridad (un org_id
// ajeno no devuelve filas), pero sí era un agujero de CORRECCIÓN: con una
// cookie vieja —de una empresa de la que ya no se es miembro, o que nunca lo
// fue— el usuario veía Licitaciones, Entidades y Precios en blanco mientras
// las órdenes le funcionaban, porque cada mitad resolvía una empresa distinta.
// Silencioso e imposible de entender desde la pantalla.
//
// No cuesta viajes de red extra: getMembresias() va memoizado con cache() y el
// layout de (app) ya lo resuelve en requireMiembro() antes de pintar nada, así
// que aquí sale gratis. Además, la cookie inválida se corrige sola.
export const orgActivaLigera = cache(async (): Promise<string | null> => {
  if (isDemo()) return demoMiembro().org_id;
  const miembro = await getMiembro();
  if (!miembro) return null;

  const cookieStore = await cookies();
  if (cookieStore.get(ORG_COOKIE)?.value !== miembro.org_id) {
    try {
      // Solo es posible desde una Server Action / route handler; durante el
      // render de una página no se puede escribir cookies y no pasa nada.
      cookieStore.set(ORG_COOKIE, miembro.org_id, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    } catch {}
  }
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
