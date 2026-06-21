"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getMembresias, ORG_COOKIE } from "@/lib/auth";
import { isDemo } from "@/lib/demo";

const UN_ANO = 60 * 60 * 24 * 365;

// Cambia la empresa activa del usuario (valida que pertenezca a ella).
export async function cambiarOrg(orgId: string) {
  if (isDemo()) return;
  const membresias = await getMembresias();
  if (!membresias.some((m) => m.org_id === orgId)) return;

  const cookieStore = await cookies();
  cookieStore.set(ORG_COOKIE, orgId, { path: "/", maxAge: UN_ANO });
  revalidatePath("/", "layout");
  redirect("/");
}

// Fija una empresa como activa (uso interno tras crear/unirse).
export async function fijarOrgActiva(orgId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ORG_COOKIE, orgId, { path: "/", maxAge: UN_ANO });
}
