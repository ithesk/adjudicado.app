// Resolución de la config de Odoo POR ORGANIZACIÓN. SOLO SERVIDOR.
//
// Orden de resolución: la cuenta conectada de la org (integracion_odoo,
// api key cifrada) → las env ODOO_* (modo legado, transición) → null.

import type { SupabaseClient } from "@supabase/supabase-js";
import { descifrar } from "@/lib/cifrado";
import { configDesdeEnv, type OdooConfig } from "@/lib/odoo";

type FilaIntegracion = {
  url: string;
  db: string;
  usuario: string;
  api_key_cifrada: string;
  activo: boolean;
  version: string | null;
  probado_at: string | null;
};

// El cliente llega de quien llama: con sesión (actions) o admin (cron).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = SupabaseClient<any, any, any>;

// POR QUÉ no hay config utilizable. Sin esto, «no hay cuenta guardada» y «hay
// cuenta pero este entorno no puede descifrar su clave» dan exactamente el
// mismo mensaje — y esa es justo la diferencia entre local y producción
// cuando CREDENCIALES_SECRET no está puesta (o es otra) en el despliegue.
// Con el mensaje genérico, el síntoma es «en local funciona y en Vercel no»
// sin ninguna pista de por dónde mirar.
export async function motivoSinOdoo(
  supabase: Cliente,
  orgId: string,
): Promise<string> {
  const SIN_CUENTA = "Odoo no está conectado — ve a Configuración → Integraciones.";
  const { data } = await supabase
    .from("integracion_odoo")
    .select("activo, api_key_cifrada")
    .eq("org_id", orgId)
    .maybeSingle();
  const fila = data as { activo: boolean; api_key_cifrada: string } | null;
  if (!fila?.activo) return SIN_CUENTA;
  try {
    descifrar(fila.api_key_cifrada);
  } catch {
    return (
      "Hay una cuenta de Odoo guardada, pero este entorno no puede descifrar su clave: " +
      "falta CREDENCIALES_SECRET o no es la misma con la que se guardó. " +
      "Revísala en las variables de entorno del despliegue."
    );
  }
  return SIN_CUENTA;
}

// Solo la URL del Odoo conectado, para poder ENLAZAR los registros desde la
// interfaz. Va aparte de obtenerConfigOdoo a propósito: esto sí viaja al
// cliente, así que aquí no puede salir ninguna credencial.
export async function urlOdoo(
  supabase: Cliente,
  orgId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("integracion_odoo")
    .select("url, activo")
    .eq("org_id", orgId)
    .maybeSingle();
  const fila = data as { url: string; activo: boolean } | null;
  if (fila?.activo && fila.url) return fila.url.replace(/\/+$/, "");
  // Modo legado por env: la URL vive ahí.
  return configDesdeEnv()?.url.replace(/\/+$/, "") ?? null;
}

export async function obtenerConfigOdoo(
  supabase: Cliente,
  orgId: string,
): Promise<OdooConfig | null> {
  const { data } = await supabase
    .from("integracion_odoo")
    .select("url, db, usuario, api_key_cifrada, activo")
    .eq("org_id", orgId)
    .maybeSingle();
  const fila = data as Pick<FilaIntegracion, "url" | "db" | "usuario" | "api_key_cifrada" | "activo"> | null;

  if (fila?.activo) {
    try {
      return {
        url: fila.url,
        db: fila.db,
        usuario: fila.usuario,
        apiKey: descifrar(fila.api_key_cifrada),
      };
    } catch (err) {
      console.error("obtenerConfigOdoo: no se pudo descifrar la API key:", err instanceof Error ? err.message : err);
      return null; // llave rota ≠ caer al env de otra empresa
    }
  }
  return configDesdeEnv();
}

// Lo que la página de Integraciones puede MOSTRAR (nunca la api key).
export interface EstadoIntegracionOdoo {
  conectado: boolean;
  via: "cuenta" | "env" | null;
  url?: string;
  db?: string;
  usuario?: string;
  version?: string | null;
  probado_at?: string | null;
}

export async function estadoIntegracionOdoo(
  supabase: Cliente,
  orgId: string,
): Promise<EstadoIntegracionOdoo> {
  const { data } = await supabase
    .from("integracion_odoo")
    .select("url, db, usuario, activo, version, probado_at")
    .eq("org_id", orgId)
    .maybeSingle();
  const fila = data as Omit<FilaIntegracion, "api_key_cifrada"> | null;

  if (fila?.activo) {
    return {
      conectado: true,
      via: "cuenta",
      url: fila.url,
      db: fila.db,
      usuario: fila.usuario,
      version: fila.version,
      probado_at: fila.probado_at,
    };
  }
  const env = configDesdeEnv();
  if (env) {
    return { conectado: true, via: "env", url: env.url, db: env.db, usuario: env.usuario };
  }
  return { conectado: false, via: null };
}
