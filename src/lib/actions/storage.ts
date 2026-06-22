"use server";

import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";

// URL firmada temporal (10 min) para ver/descargar un archivo privado.
// La RLS de storage ya restringe por organización (carpeta = org_id).
export async function urlFirmada(
  bucket: "documentos" | "ordenes-oc",
  path: string,
): Promise<string | null> {
  if (isDemo()) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}
