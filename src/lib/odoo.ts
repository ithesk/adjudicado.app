// Cliente JSON-RPC para Odoo. Todas las llamadas se hacen server-side.
// Nunca lanza excepciones sin capturar: devuelve {ok:false, error} en su lugar.
//
// Desde 2026-07-23 las credenciales van POR ORGANIZACIÓN (tabla
// integracion_odoo, ver src/lib/odoo-config.ts): todas las funciones reciben
// la config como parámetro. Las env ODOO_* quedan como modo legado.

const TIMEOUT_MS = 10_000;

export interface OdooConfig {
  url: string;
  db: string;
  usuario: string;
  apiKey: string;
}

/** La config legada por variables de entorno (transición), o null. */
export function configDesdeEnv(): OdooConfig | null {
  const url = process.env.ODOO_URL ?? "";
  const db = process.env.ODOO_DB ?? "";
  const usuario = process.env.ODOO_USERNAME ?? "";
  const apiKey = process.env.ODOO_API_KEY ?? "";
  return url && db && usuario && apiKey ? { url, db, usuario, apiKey } : null;
}

// ── Helpers internos ──────────────────────────────────────────────────────────

/** Llama a un método JSON-RPC de Odoo con timeout automático. */
async function rpc(
  config: OdooConfig,
  service: "common" | "object",
  method: string,
  args: unknown[],
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${config.url}/jsonrpc`, {
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
async function autenticar(config: OdooConfig): Promise<number> {
  const uid = await rpc(config, "common", "authenticate", [
    config.db,
    config.usuario,
    config.apiKey,
    {},
  ]);
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
export async function probarConexion(config: OdooConfig): Promise<ResultadoConexion> {
  try {
    // common.version no requiere autenticación.
    const info = (await rpc(config, "common", "version", [])) as Record<string, unknown>;
    const version = String(info?.server_version ?? info?.server_serie ?? "desconocida");

    // Verificamos que las credenciales son válidas.
    await autenticar(config);

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

const CAMPOS_FACTURA = ["name", "state", "payment_state", "amount_total", "amount_residual"];

type RegistroFactura = {
  id: number;
  name: string;
  state: string;
  payment_state: string;
  amount_total: number;
  amount_residual: number;
};

function aFactura(r: RegistroFactura): FacturaOdoo {
  return {
    id: r.id,
    name: r.name,
    // Si la factura está en borrador usamos state; si ya está publicada, payment_state.
    estado: r.state === "draft" ? "draft" : (r.payment_state ?? r.state),
    montoTotal: r.amount_total,
    residual: r.amount_residual,
  };
}

function dominioFactura(numeroOc: string) {
  return [
    ["move_type", "=", "out_invoice"],
    "|",
    ["invoice_origin", "ilike", numeroOc],
    ["ref", "ilike", numeroOc],
  ];
}

/**
 * Busca en account.move la factura (out_invoice) cuyo invoice_origin o ref
 * contenga el número de OC recibido. Devuelve null si no encuentra ninguna.
 */
export async function buscarFactura(
  config: OdooConfig,
  numeroOc: string,
): Promise<FacturaOdoo | null> {
  try {
    const uid = await autenticar(config);
    const registros = (await rpc(config, "object", "execute_kw", [
      config.db,
      uid,
      config.apiKey,
      "account.move",
      "search_read",
      [dominioFactura(numeroOc)],
      { fields: CAMPOS_FACTURA, limit: 1 },
    ])) as RegistroFactura[];

    return registros?.length ? aFactura(registros[0]) : null;
  } catch (err) {
    console.error("buscarFactura error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Versión por LOTE para el cron: autentica UNA vez y busca la factura de
 * cada OC en serie (gentil con el Odoo del VPS). Devuelve solo las
 * encontradas; un fallo en una OC no tumba el resto.
 */
export async function buscarFacturasLote(
  config: OdooConfig,
  numerosOc: string[],
): Promise<Map<string, FacturaOdoo>> {
  const resultado = new Map<string, FacturaOdoo>();
  if (numerosOc.length === 0) return resultado;

  let uid: number;
  try {
    uid = await autenticar(config);
  } catch (err) {
    console.error("buscarFacturasLote: autenticación falló:", err instanceof Error ? err.message : err);
    return resultado;
  }

  for (const oc of numerosOc) {
    try {
      const registros = (await rpc(config, "object", "execute_kw", [
        config.db,
        uid,
        config.apiKey,
        "account.move",
        "search_read",
        [dominioFactura(oc)],
        { fields: CAMPOS_FACTURA, limit: 1 },
      ])) as RegistroFactura[];
      if (registros?.length) resultado.set(oc, aFactura(registros[0]));
    } catch (err) {
      console.error(`buscarFacturasLote: falló la OC ${oc}:`, err instanceof Error ? err.message : err);
    }
  }
  return resultado;
}
