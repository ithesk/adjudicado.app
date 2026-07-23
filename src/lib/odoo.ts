// Cliente JSON-RPC para Odoo. Todas las llamadas se hacen server-side.
// Nunca lanza excepciones sin capturar: devuelve {ok:false, error} en su lugar.

const TIMEOUT_MS = 10_000;

// ── Helpers internos ──────────────────────────────────────────────────────────

function vars() {
  return {
    url: process.env.ODOO_URL ?? "",
    db: process.env.ODOO_DB ?? "",
    username: process.env.ODOO_USERNAME ?? "",
    apiKey: process.env.ODOO_API_KEY ?? "",
  };
}

/** Comprueba si las cuatro variables de entorno necesarias están presentes. */
export function odooConfigurado(): boolean {
  const { url, db, username, apiKey } = vars();
  return Boolean(url && db && username && apiKey);
}

/** Llama a un método JSON-RPC de Odoo con timeout automático. */
async function rpc(
  service: "common" | "object",
  method: string,
  args: unknown[],
): Promise<unknown> {
  const { url } = vars();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${url}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        id: 1,
        params: { service, method, args },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const json = (await res.json()) as {
      result?: unknown;
      error?: { message?: string; data?: { message?: string } };
    };

    if (json.error) {
      const msg =
        json.error.data?.message ??
        json.error.message ??
        "Error desconocido de Odoo";
      throw new Error(msg);
    }

    return json.result;
  } finally {
    clearTimeout(timer);
  }
}

/** Autentica y devuelve el uid del usuario, o lanza si las credenciales fallan. */
async function autenticar(): Promise<number> {
  const { db, username, apiKey } = vars();
  const uid = await rpc("common", "authenticate", [db, username, apiKey, {}]);
  if (!uid || typeof uid !== "number") {
    throw new Error("Autenticación fallida: credenciales incorrectas o sin acceso.");
  }
  return uid;
}

// ── API pública ───────────────────────────────────────────────────────────────

export interface ResultadoConexion {
  ok: boolean;
  error?: string;
  version?: string;
}

/**
 * Verifica la conectividad con Odoo: obtiene la versión del servidor y
 * comprueba que las credenciales autentican correctamente.
 */
export async function probarConexion(): Promise<ResultadoConexion> {
  if (!odooConfigurado()) {
    return { ok: false, error: "Odoo no está configurado (faltan variables de entorno)." };
  }

  try {
    // common.version no requiere autenticación.
    const info = (await rpc("common", "version", [])) as Record<string, unknown>;
    const version = String(info?.server_version ?? info?.server_serie ?? "desconocida");

    // Verificamos que las credenciales son válidas.
    await autenticar();

    return { ok: true, version };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface FacturaOdoo {
  id: number;
  name: string;
  /** Estado de pago: not_paid, in_payment, paid, partial, reversed, o "draft". */
  estado: string;
  montoTotal: number;
  residual: number;
}

/**
 * Busca en account.move la factura (out_invoice) cuyo invoice_origin o ref
 * contenga el número de OC recibido. Devuelve null si no encuentra ninguna.
 */
/**
 * Versión por LOTE para el cron: autentica UNA vez y busca la factura de
 * cada OC en serie (gentil con el Odoo del VPS). Devuelve solo las
 * encontradas; un fallo en una OC no tumba el resto.
 */
export async function buscarFacturasLote(
  numerosOc: string[],
): Promise<Map<string, FacturaOdoo>> {
  const resultado = new Map<string, FacturaOdoo>();
  if (!odooConfigurado() || numerosOc.length === 0) return resultado;

  let uid: number;
  const { db, apiKey } = vars();
  try {
    uid = await autenticar();
  } catch (err) {
    console.error("buscarFacturasLote: autenticación falló:", err instanceof Error ? err.message : err);
    return resultado;
  }

  for (const oc of numerosOc) {
    try {
      const registros = (await rpc("object", "execute_kw", [
        db,
        uid,
        apiKey,
        "account.move",
        "search_read",
        [[
          ["move_type", "=", "out_invoice"],
          "|",
          ["invoice_origin", "ilike", oc],
          ["ref", "ilike", oc],
        ]],
        { fields: ["name", "state", "payment_state", "amount_total", "amount_residual"], limit: 1 },
      ])) as Array<{
        id: number;
        name: string;
        state: string;
        payment_state: string;
        amount_total: number;
        amount_residual: number;
      }>;
      if (registros?.length) {
        const r = registros[0];
        resultado.set(oc, {
          id: r.id,
          name: r.name,
          estado: r.state === "draft" ? "draft" : (r.payment_state ?? r.state),
          montoTotal: r.amount_total,
          residual: r.amount_residual,
        });
      }
    } catch (err) {
      console.error(`buscarFacturasLote: falló la OC ${oc}:`, err instanceof Error ? err.message : err);
    }
  }
  return resultado;
}

export async function buscarFactura(numeroOc: string): Promise<FacturaOdoo | null> {
  if (!odooConfigurado()) return null;

  try {
    const { db, apiKey } = vars();
    const uid = await autenticar();

    const domain = [
      ["move_type", "=", "out_invoice"],
      "|",
      ["invoice_origin", "ilike", numeroOc],
      ["ref", "ilike", numeroOc],
    ];

    const fields = ["name", "state", "payment_state", "amount_total", "amount_residual"];

    const registros = (await rpc("object", "execute_kw", [
      db,
      uid,
      apiKey,
      "account.move",
      "search_read",
      [domain],
      { fields, limit: 1 },
    ])) as Array<{
      id: number;
      name: string;
      state: string;
      payment_state: string;
      amount_total: number;
      amount_residual: number;
    }>;

    if (!registros || registros.length === 0) return null;

    const r = registros[0];

    // Si la factura está en borrador usamos state; si ya está publicada, payment_state.
    const estado = r.state === "draft" ? "draft" : (r.payment_state ?? r.state);

    return {
      id: r.id,
      name: r.name,
      estado,
      montoTotal: r.amount_total,
      residual: r.amount_residual,
    };
  } catch (err) {
    console.error("buscarFactura error:", err instanceof Error ? err.message : err);
    return null;
  }
}
