"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMiembro } from "@/lib/auth";
import { isDemo } from "@/lib/demo";

function refrescar() {
  revalidatePath("/configuracion/grupos");
  revalidatePath("/");
}

export async function crearGrupo(nombre: string) {
  if (isDemo()) return;
  const limpio = nombre.trim();
  if (!limpio) return;
  const miembro = await getMiembro();
  if (!miembro) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("grupo")
    .insert({ org_id: miembro.org_id, nombre: limpio });
  if (error) console.error("crearGrupo falló:", error.message);
  refrescar();
}

export async function renombrarGrupo(grupoId: string, nombre: string) {
  if (isDemo()) return;
  const limpio = nombre.trim();
  if (!limpio) return;
  const supabase = await createClient();
  await supabase.from("grupo").update({ nombre: limpio }).eq("id", grupoId);
  refrescar();
}

export async function eliminarGrupo(grupoId: string) {
  if (isDemo()) return;
  const supabase = await createClient();
  // Las órdenes asignadas quedan sin grupo (FK on delete set null).
  await supabase.from("grupo").delete().eq("id", grupoId);
  refrescar();
}

// Agrega o quita a una persona del grupo.
export async function toggleMiembroGrupo(grupoId: string, userId: string) {
  if (isDemo()) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("grupo_miembro")
    .select("grupo_id")
    .eq("grupo_id", grupoId)
    .eq("user_id", userId)
    .maybeSingle();
  if (data) {
    await supabase
      .from("grupo_miembro")
      .delete()
      .eq("grupo_id", grupoId)
      .eq("user_id", userId);
  } else {
    await supabase
      .from("grupo_miembro")
      .insert({ grupo_id: grupoId, user_id: userId });
  }
  refrescar();
}

// Asigna una orden a un grupo (o la deja sin grupo).
export async function asignarGrupo(ordenId: string, grupoId: string | null) {
  if (isDemo()) return;
  const supabase = await createClient();
  await supabase.from("orden").update({ grupo_id: grupoId }).eq("id", ordenId);
  revalidatePath(`/orden/${ordenId}`);
  revalidatePath("/");
}
