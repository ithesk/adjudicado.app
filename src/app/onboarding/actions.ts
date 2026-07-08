"use server";

import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { fijarOrgActiva } from "@/lib/actions/org";
import { createAdminClient } from "@/lib/supabase/admin";

export type OnbState = { error?: string };

// Crear una organización nueva: el creador queda como admin.
export async function crearOrganizacion(
  _prev: OnbState,
  formData: FormData,
): Promise<OnbState> {
  const user = await getUser();
  if (!user) redirect("/login");

  const nombre = String(formData.get("nombre") || "").trim();
  const miNombre = String(formData.get("mi_nombre") || "").trim();
  if (!nombre) return { error: "Escribe el nombre de la organización." };

  const admin = createAdminClient();

  const { data: org, error: e1 } = await admin
    .from("organizacion")
    .insert({ nombre })
    .select()
    .single();
  if (e1 || !org) return { error: "No se pudo crear la organización." };

  const { error: e2 } = await admin.from("miembro").insert({
    org_id: org.id,
    user_id: user.id,
    nombre: miNombre || user.email,
    rol: "admin",
  });
  if (e2) return { error: "No se pudo registrar tu membresía." };

  await fijarOrgActiva(org.id);
  redirect("/tablero");
}

// Unirse a una organización existente con su código (= id de la organización).
export async function unirseOrganizacion(
  _prev: OnbState,
  formData: FormData,
): Promise<OnbState> {
  const user = await getUser();
  if (!user) redirect("/login");

  const codigo = String(formData.get("codigo") || "").trim();
  const miNombre = String(formData.get("mi_nombre") || "").trim();
  if (!codigo) return { error: "Pega el código de invitación." };

  const admin = createAdminClient();

  const { data: org } = await admin
    .from("organizacion")
    .select("id")
    .eq("id", codigo)
    .maybeSingle();
  if (!org) return { error: "Código inválido. Pídeselo a un administrador." };

  await admin.from("miembro").insert({
    org_id: org.id,
    user_id: user.id,
    nombre: miNombre || user.email,
    rol: "colaborador",
  });
  // unique(org_id, user_id) → si ya era miembro, igual la fijamos como activa.
  await fijarOrgActiva(org.id);
  redirect("/tablero");
}
