"use client";

// Subida a Supabase Storage QUE REPORTA AVANCE.
//
// El SDK de Supabase no expone progreso: su `.upload()` usa fetch, que no
// permite observar los bytes enviados. Por eso aquí se habla con la API de
// Storage por XMLHttpRequest, que sí tiene `upload.onprogress`.
//
// Es el único sitio del sistema donde el avance es un HECHO medible —
// bytes enviados sobre bytes totales—, y por eso es el único que enseña un
// porcentaje de verdad. Todo lo demás (el trabajo del servidor) usa barra
// indeterminada: inventar un número sería peor que no dar ninguno.

import { createClient } from "@/lib/supabase/client";

export async function subirConProgreso(
  bucket: string,
  ruta: string,
  archivo: File,
  onProgreso: (porcentaje: number) => void,
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { error: "Tu sesión caducó. Recarga la página y vuelve a entrar." };

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${bucket}/${ruta}`;

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    xhr.setRequestHeader(
      "Content-Type",
      archivo.type || "application/octet-stream",
    );

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgreso((e.loaded / e.total) * 100);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgreso(100);
        resolve({ error: null });
        return;
      }
      // El cuerpo de error de Storage es JSON; si no lo fuera, se usa el
      // código, que al menos identifica el problema.
      let msg = `El almacenamiento rechazó el archivo (error ${xhr.status}).`;
      try {
        const j = JSON.parse(xhr.responseText);
        if (j?.message) msg = `No se pudo subir el archivo: ${j.message}`;
      } catch {}
      resolve({ error: msg });
    };
    xhr.onerror = () =>
      resolve({ error: "Se cortó la conexión mientras se subía el archivo." });
    xhr.ontimeout = () => resolve({ error: "La subida tardó demasiado." });
    xhr.send(archivo);
  });
}
