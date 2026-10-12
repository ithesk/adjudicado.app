// Disparar la preparación de un expediente en segundo plano.
//
// La ruta /api/expedientes/preparar responde al instante (202) y trabaja en
// after(), con su propio tiempo de función; si no termina, se vuelve a
// llamar a sí misma. Quien la dispara (el MCP, el cron) no espera: consulta
// lic_expediente después.

import { createHash } from "node:crypto";

// Secreto de las llamadas internas, derivado de la service_role (que solo
// tiene el servidor): no hace falta configurar nada más. NO es CRON_SECRET a
// propósito: definir CRON_SECRET activa los crons de Vercel (también el de
// Odoo), y eso debe ser una decisión aparte.
export function secretoInterno() {
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY.");
  return createHash("sha256").update(`adjudicado:expedientes:${base}`).digest("hex");
}

export async function encolarExpediente(codigo: string, origen: string) {
  const res = await fetch(`${origen}/api/expedientes/preparar`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${secretoInterno()}` },
    body: JSON.stringify({ codigo }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`No se pudo encolar el expediente ${codigo} (HTTP ${res.status}).`);
  }
}
