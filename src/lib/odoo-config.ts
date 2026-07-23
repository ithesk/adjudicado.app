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
