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
  config: Pick<OdooConfig, "url">,
  service: "common" | "object" | "db",
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

// Lo que se puede DESCUBRIR de un servidor Odoo con solo la URL — para que
// el usuario no tenga que saber ni la versión ni el nombre de la base.
export interface ServidorOdoo {
  version: string;
  /** Bases publicadas por db.list (muchos servidores lo deshabilitan). */
  bases: string[];
  /** Mejor conjetura cuando db.list no está: el subdominio de odoo.com. */
  sugerida: string | null;
}

export async function descubrirServidor(
  url: string,
): Promise<{ ok: true; servidor: ServidorOdoo } | { ok: false; error: string }> {
  try {
    const info = (await rpc({ url }, "common", "version", [])) as Record<string, unknown>;
    const version = String(info?.server_version ?? info?.server_serie ?? "desconocida");

    let bases: string[] = [];
    try {
      const r = await rpc({ url }, "db", "list", []);
      if (Array.isArray(r)) bases = r.filter((x): x is string => typeof x === "string");
    } catch {
      // db.list deshabilitado (normal en odoo.com y servidores endurecidos).
    }

    // En odoo.com la base casi siempre se llama como el subdominio.
    const sub = url.match(/^https?:\/\/([^./]+)\.odoo\.com/i)?.[1] ?? null;
    return { ok: true, servidor: { version, bases, sugerida: bases.length ? null : sub } };
  } catch (err) {
    return {
      ok: false,
      error: `No se pudo alcanzar ese servidor Odoo: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
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
    const msg = err instanceof Error ? err.message : String(err);

    // Odoo dice «credenciales incorrectas» también cuando la BASE está mal
    // o cuando el usuario entra con Google/2FA. Diagnosticar cuál es.
    if (/Autenticación fallida/.test(msg)) {
      try {
        const r = await rpc(config, "db", "list", []);
        if (Array.isArray(r) && r.length && !r.includes(config.db)) {
          return {
            ok: false,
            error: `La base de datos «${config.db}» no existe en ese servidor. Disponibles: ${r.join(", ")}.`,
          };
        }
      } catch {
        // db.list deshabilitado: no se puede verificar la base.
      }
      return {
        ok: false,
        error:
          "Odoo rechazó las credenciales. Revisa: (1) que la base de datos sea EXACTA; " +
          "(2) si entras a Odoo con Google o tienes verificación en dos pasos, tu contraseña NO sirve para la API — " +
          "crea una API key en Odoo: tu avatar → Mi perfil → Seguridad de la cuenta → Claves API → Nueva.",
      };
    }
    return { ok: false, error: msg };
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

// ── Crear el flujo de venta (cliente → productos → orden → conduce) ──────────

export interface LineaVenta {
  nombre: string;
  tipo: "licencia" | "fisico" | "servicio";
  cantidad: number;
  /** Precio unitario en la OC (null = se deja en 0 y se ajusta en Odoo). */
  precioUnitario: number | null;
}

export interface FlujoVentaCreado {
  ordenVentaId: number;
  ordenVentaNombre: string;
  /** Los conduces (stock.picking) que Odoo generó al confirmar. */
  conduces: string[];
  /** Productos que hubo que crear (no existían). */
  productosCreados: string[];
  clienteCreado: boolean;
}

/**
 * Reproduce en Odoo el flujo manual de una OC nueva: cliente (lo crea si no
 * existe), productos (ídem — los físicos con seguimiento por serie), orden
 * de venta con las líneas, y la CONFIRMA para que Odoo genere el conduce.
 * Las series se ponen en Odoo al validar el conduce (mundo físico).
 */
export async function crearFlujoVenta(
  config: OdooConfig,
  datos: {
    clienteNombre: string;
    clienteRnc?: string | null;
    /** El número de OC — queda como referencia del cliente en la orden. */
    referencia: string;
    lineas: LineaVenta[];
  },
): Promise<{ ok: true; flujo: FlujoVentaCreado } | { ok: false; error: string }> {
  try {
    const uid = await autenticar(config);
    const kw = (modelo: string, metodo: string, args: unknown[], kwargs: Record<string, unknown> = {}) =>
      rpc(config, "object", "execute_kw", [config.db, uid, config.apiKey, modelo, metodo, args, kwargs]);

    // 1) El cliente: por nombre exacto (sin mayúsculas), luego por RNC.
    let clienteCreado = false;
    let clienteId: number | null = null;
    const porNombre = (await kw("res.partner", "search", [[["name", "=ilike", datos.clienteNombre]]], { limit: 1 })) as number[];
    clienteId = porNombre?.[0] ?? null;
    if (!clienteId && datos.clienteRnc) {
      const porRnc = (await kw("res.partner", "search", [[["vat", "=", datos.clienteRnc]]], { limit: 1 })) as number[];
      clienteId = porRnc?.[0] ?? null;
    }
    if (!clienteId) {
      clienteId = (await kw("res.partner", "create", [
        { name: datos.clienteNombre, is_company: true, vat: datos.clienteRnc || false, customer_rank: 1 },
      ])) as number;
      clienteCreado = true;
    }

    // 2) Los productos: por nombre exacto; se crean los que falten.
    const productosCreados: string[] = [];
    const lineasOdoo: Array<[number, number, Record<string, unknown>]> = [];
    for (const linea of datos.lineas) {
      const existentes = (await kw("product.product", "search", [[["name", "=ilike", linea.nombre]]], { limit: 1 })) as number[];
      let productoId = existentes?.[0] ?? null;
      if (!productoId) {
        // Se sigue la convención del Odoo del cliente (visto en sus datos):
        // licencias y equipos como CONSUMIBLE, servicios como servicio.
        const base: Record<string, unknown> = {
          name: linea.nombre,
          detailed_type: linea.tipo === "servicio" ? "service" : "consu",
          list_price: linea.precioUnitario ?? 0,
        };
        try {
          // Físico → seguimiento por número de serie (como el flujo manual).
          productoId = (await kw("product.product", "create", [
            linea.tipo === "fisico" ? { ...base, tracking: "serial" } : base,
          ])) as number;
        } catch {
          // Sin lotes/series habilitados en ese Odoo: se crea sin tracking.
          productoId = (await kw("product.product", "create", [base])) as number;
        }
        productosCreados.push(linea.nombre);
      }
      lineasOdoo.push([0, 0, {
        product_id: productoId,
        product_uom_qty: linea.cantidad,
        price_unit: linea.precioUnitario ?? 0,
      }]);
    }

    // 3) La orden de venta, confirmada → Odoo genera el conduce solo.
    const ordenVentaId = (await kw("sale.order", "create", [
      { partner_id: clienteId, client_order_ref: datos.referencia, order_line: lineasOdoo },
    ])) as number;
    await kw("sale.order", "action_confirm", [[ordenVentaId]]);

    const [venta] = (await kw("sale.order", "read", [[ordenVentaId]], { fields: ["name", "picking_ids"] })) as Array<{
      name: string;
      picking_ids: number[];
    }>;
    let conduces: string[] = [];
    if (venta?.picking_ids?.length) {
      const pickings = (await kw("stock.picking", "read", [venta.picking_ids], { fields: ["name"] })) as Array<{ name: string }>;
      conduces = pickings.map((p) => p.name);
    }

    return {
      ok: true,
      flujo: {
        ordenVentaId,
        ordenVentaNombre: venta?.name ?? `#${ordenVentaId}`,
        conduces,
        productosCreados,
        clienteCreado,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Una factura como aparece en el selector de vincular (con su cliente).
export interface FacturaResumen extends FacturaOdoo {
  cliente: string;
  fecha: string | null;
}

/**
 * Las facturas recientes del Odoo — para VINCULAR a mano cuando la búsqueda
 * por OC no encuentra (caso típico: las facturas no llevan el número de OC).
 */
export async function listarFacturasRecientes(
  config: OdooConfig,
  limite = 15,
): Promise<FacturaResumen[]> {
  try {
    const uid = await autenticar(config);
    const registros = (await rpc(config, "object", "execute_kw", [
      config.db,
      uid,
      config.apiKey,
      "account.move",
      "search_read",
      [[["move_type", "=", "out_invoice"]]],
      { fields: [...CAMPOS_FACTURA, "partner_id", "invoice_date"], limit: limite, order: "id desc" },
    ])) as Array<RegistroFactura & { partner_id: [number, string] | false; invoice_date: string | false }>;
    return (registros ?? []).map((r) => ({
      ...aFactura(r),
      cliente: Array.isArray(r.partner_id) ? r.partner_id[1] : "",
      fecha: r.invoice_date || null,
    }));
  } catch (err) {
    console.error("listarFacturasRecientes error:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Lee facturas CONCRETAS por id (las ya vinculadas): una sola llamada para
 * todas — es como el cron refresca el estado de pago.
 */
export async function leerFacturasPorId(
  config: OdooConfig,
  ids: number[],
): Promise<Map<number, FacturaOdoo>> {
  const resultado = new Map<number, FacturaOdoo>();
  if (ids.length === 0) return resultado;
  try {
    const uid = await autenticar(config);
    const registros = (await rpc(config, "object", "execute_kw", [
      config.db,
      uid,
      config.apiKey,
      "account.move",
      "search_read",
      [[["id", "in", ids]]],
      { fields: CAMPOS_FACTURA },
    ])) as RegistroFactura[];
    for (const r of registros ?? []) resultado.set(r.id, aFactura(r));
  } catch (err) {
    console.error("leerFacturasPorId error:", err instanceof Error ? err.message : err);
  }
  return resultado;
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
