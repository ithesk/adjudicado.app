// Tipos del dominio + helpers de negocio (máquina de estados, urgencia, formato).

export type Estado =
  | "orden_recibida"
  | "en_coordinacion"
  | "entregado"
  | "listo_facturar"
  | "facturado"
  | "cobrado"
  | "cerrado";

export type TipoItem = "licencia" | "fisico" | "servicio";
// "evento" = entrada generada por el sistema (avance de estado, reasignación,
// ítem entregado…). El resto las escribe una persona.
export type TipoBitacora =
  | "nota"
  | "correo"
  | "llamada"
  | "suplidor"
  | "evento";
export type SuplidorEstado = "pedido" | "en_transito" | "recibido";

export interface Organizacion {
  id: string;
  nombre: string;
  created_at: string;
}

export interface Miembro {
  id: string;
  org_id: string;
  user_id: string;
  nombre: string | null;
  rol: "admin" | "colaborador";
  created_at: string;
  organizacion?: Organizacion;
}

export interface Orden {
  id: string;
  org_id: string;
  numero_oc: string | null;
  institucion: string | null;
  codigo_expediente: string | null;
  monto: number | null;
  moneda: string;
  fecha_oc: string | null;
  plazo_entrega: string | null;
  estado: Estado;
  suplidor: string | null;
  suplidor_estado: SuplidorEstado | null;
  suplidor_fecha_estim: string | null;
  metodo_pago: string | null;
  plazo_pago_dias: number | null;
  responsable_id: string | null;
  colaboradores?: string[]; // user_ids de colaboradores (además del responsable)
  etiquetas: string[];
  oc_archivo_url: string | null;
  ocr_raw: unknown;
  creado_por: string | null;
  created_at: string;
  updated_at: string;
}

// Persona (resuelta) que aparece como responsable de una orden.
export interface Persona {
  id: string;
  nombre: string;
}

// ---------- Entidades reutilizables (catálogo) ----------

// Contacto reutilizable: vive dentro de un suplidor o de una institución.
export interface Contacto {
  id: string;
  nombre: string;
  rol: string | null; // cargo: "Ejecutivo de cuenta", "Encargada de compras"…
  email: string | null;
  telefono: string | null;
}

// Suplidor del catálogo (Ingram, Amazon…). Reutilizable entre ítems/órdenes.
export interface Suplidor {
  id: string;
  nombre: string;
  canal: CanalItem | null;
  notas: string | null;
  contactos: Contacto[];
}

// Institución del Estado (INABIE…). Tiene sus propios contactos.
export interface Institucion {
  id: string;
  nombre: string;
  siglas: string | null;
  contactos: Contacto[];
}

// Nombre legible para mostrar. Si el "nombre" es en realidad un correo
// (caso típico de un invitado que aún no puso su nombre), usa la parte local
// capitalizada: "acosta@innova.com" → "Acosta", "juan.perez@x.com" → "Juan Perez".
export function nombreLegible(nombre: string | null | undefined): string {
  const n = (nombre ?? "").trim();
  if (!n) return "—";
  if (!n.includes("@")) return n;
  const local = n.split("@")[0];
  const bonito = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
  return bonito || n;
}

export function iniciales(nombre: string | null | undefined): string {
  if (!nombre) return "?";
  const partes = nombre.trim().split(/\s+/);
  const a = partes[0]?.[0] ?? "";
  const b = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (a + b).toUpperCase() || "?";
}

export type CanalItem =
  | "suscripcion"
  | "amazon"
  | "distribuidor"
  | "fabricante"
  | "directo";

export const CANAL_LABEL: Record<CanalItem, string> = {
  suscripcion: "Suscripción",
  amazon: "Amazon",
  distribuidor: "Distribuidor",
  fabricante: "Fabricante",
  directo: "Directo",
};

// Reparto de un ítem entre varios suplidores: "5 unidades, 1 por Amazon y 4
// por eBay". Cada parte tiene su propio suplidor, cantidad, precio y flujo.
export interface Asignacion {
  id: string;
  suplidor: string | null;
  canal: CanalItem | null;
  cantidad: number;
  precio: number | null; // total de esta parte (RD$)
  estado_item: string | null; // clave dentro del flujo del tipo del ítem
  fecha_estim: string | null; // ETA propia de esta parte
}

export interface Item {
  id: string;
  orden_id: string;
  nombre: string;
  tipo: TipoItem;
  cantidad: number;
  entregado: boolean;
  fecha_entrega: string | null;
  notas: string | null;
  orden_indice: number;
  // El ítem es la unidad real de cumplimiento:
  suplidor: string | null;
  canal: CanalItem | null;
  estado_item: string | null; // clave dentro del flujo de su tipo
  fecha_estim: string | null; // ETA propia del ítem
  precio: number | null; // precio acordado del ítem (cuando no está repartido)
  condiciones: string | null; // soporte, términos, tracking…
  coordinacion?: Bitacora[]; // hilo de coordinación propio (demo)
  asignaciones?: Asignacion[]; // reparto entre suplidores (demo)
}

// Flujo (pipeline) por tipo de ítem. El último estado = entregado/activado.
export const FLUJO_ITEM: Record<TipoItem, { key: string; label: string }[]> = {
  servicio: [
    { key: "pendiente", label: "Pendiente" },
    { key: "metodo_definido", label: "Método de pago definido" },
    { key: "activado", label: "Activado" },
  ],
  fisico: [
    { key: "pendiente", label: "Pendiente" },
    { key: "pedido", label: "Pedido" },
    { key: "en_transito", label: "En tránsito" },
    { key: "recibido", label: "Recibido" },
  ],
  licencia: [
    { key: "pendiente", label: "Pendiente" },
    { key: "esperando_fabrica", label: "Esperando fábrica" },
    { key: "cotizando", label: "Cotizando" },
    { key: "negociando", label: "Negociando" },
    { key: "ordenado", label: "Ordenado" },
    { key: "activado", label: "Activado" },
  ],
};

export function flujoDeItem(item: Item) {
  return FLUJO_ITEM[item.tipo];
}

export function estadoItemLabel(item: Item): string {
  const f = flujoDeItem(item);
  const e = item.estado_item ?? f[0].key;
  return f.find((x) => x.key === e)?.label ?? f[0].label;
}

// ¿Esta parte (reparto) ya llegó a su estado terminal?
export function asignacionEntregada(item: Item, a: Asignacion): boolean {
  const f = FLUJO_ITEM[item.tipo];
  return a.estado_item === f[f.length - 1].key;
}

export function tieneReparto(item: Item): boolean {
  return (item.asignaciones?.length ?? 0) > 0;
}

export function itemEntregado(item: Item): boolean {
  if (tieneReparto(item)) {
    return item.asignaciones!.every((a) => asignacionEntregada(item, a));
  }
  const f = flujoDeItem(item);
  const terminal = f[f.length - 1].key;
  return item.entregado || item.estado_item === terminal;
}

// "1× Amazon · 4× eBay" — resumen legible del reparto.
export function resumenReparto(item: Item): string {
  return (item.asignaciones ?? [])
    .map((a) => `${a.cantidad}× ${a.suplidor || "sin suplidor"}`)
    .join(" · ");
}

export function cantidadRepartida(item: Item): number {
  return (item.asignaciones ?? []).reduce((n, a) => n + (a.cantidad || 0), 0);
}

export function precioTotalItem(item: Item): number | null {
  if (tieneReparto(item)) {
    const partes = item.asignaciones!.filter((a) => a.precio != null);
    if (partes.length === 0) return null;
    return partes.reduce((s, a) => s + (a.precio ?? 0), 0);
  }
  return item.precio;
}

export function proximoEstadoItem(item: Item): { key: string; label: string } | null {
  const f = flujoDeItem(item);
  const i = f.findIndex((x) => x.key === (item.estado_item ?? f[0].key));
  return i >= 0 && i < f.length - 1 ? f[i + 1] : null;
}

export interface Bitacora {
  id: string;
  orden_id: string;
  autor_id: string | null;
  tipo: TipoBitacora;
  texto: string;
  created_at: string;
  autor?: Persona | null;
}

export interface Documento {
  id: string;
  orden_id: string;
  nombre: string;
  tipo: string;
  archivo_url: string;
  subido_por: string | null;
  created_at: string;
}

// ---------- Máquina de estados ----------

export const ESTADOS: Estado[] = [
  "orden_recibida",
  "en_coordinacion",
  "entregado",
  "listo_facturar",
  "facturado",
  "cobrado",
  "cerrado",
];

export const ESTADO_LABEL: Record<Estado, string> = {
  orden_recibida: "Orden recibida",
  en_coordinacion: "En coordinación",
  entregado: "Entregado",
  listo_facturar: "Listo para facturar",
  facturado: "Facturado",
  cobrado: "Cobrado",
  cerrado: "Cerrado",
};

export function siguienteEstado(estado: Estado): Estado | null {
  const i = ESTADOS.indexOf(estado);
  return i >= 0 && i < ESTADOS.length - 1 ? ESTADOS[i + 1] : null;
}

// Órdenes "vivas" = aún no cobradas/cerradas.
export function esViva(estado: Estado): boolean {
  return estado !== "cobrado" && estado !== "cerrado";
}

// El reloj de entrega corre hasta que se entrega.
export function relojEntregaActivo(estado: Estado): boolean {
  return estado === "orden_recibida" || estado === "en_coordinacion";
}

// "Atascado sin facturar": entregado pero todavía sin facturar.
export function estaAtascado(estado: Estado): boolean {
  return estado === "entregado" || estado === "listo_facturar";
}

// "Por cobrar": facturado y esperando el pago.
export function porCobrar(estado: Estado): boolean {
  return estado === "facturado";
}

// ---------- Urgencia de plazo ----------

export type NivelUrgencia = "vencido" | "rojo" | "ambar" | "verde" | "neutro";

export function diasRestantes(fechaISO: string | null): number | null {
  if (!fechaISO) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const objetivo = new Date(fechaISO + "T00:00:00");
  const ms = objetivo.getTime() - hoy.getTime();
  return Math.round(ms / 86_400_000);
}

// Plazo dominante para ordenar/colorear: si el reloj de entrega está activo,
// manda plazo_entrega; si está facturado, manda el plazo de pago estimado.
export function plazoDominante(orden: Orden): string | null {
  if (relojEntregaActivo(orden.estado)) return orden.plazo_entrega;
  if (orden.estado === "facturado" && orden.plazo_pago_dias) {
    // Aproximación: facturado + plazo_pago_dias a partir de updated_at.
    const base = new Date(orden.updated_at);
    base.setDate(base.getDate() + orden.plazo_pago_dias);
    return base.toISOString().slice(0, 10);
  }
  return null;
}

export function nivelUrgencia(dias: number | null): NivelUrgencia {
  if (dias === null) return "neutro";
  if (dias < 0) return "vencido";
  if (dias <= 2) return "rojo";
  if (dias <= 5) return "ambar";
  return "verde";
}

// ---------- Formato ----------

export function formatRD(monto: number | null, moneda = "DOP"): string {
  const valor = monto ?? 0;
  const simbolo = moneda === "USD" ? "US$" : "RD$";
  return (
    simbolo +
    new Intl.NumberFormat("es-DO", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)
  );
}

// Tiempo relativo corto en español ("hace 2 d", "hace 3 h", "ahora").
export function tiempoRelativo(iso: string): string {
  const ahora = Date.now();
  const t = new Date(iso).getTime();
  const seg = Math.max(0, Math.round((ahora - t) / 1000));
  if (seg < 60) return "ahora";
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const dias = Math.round(hrs / 24);
  if (dias < 30) return `hace ${dias} d`;
  const meses = Math.round(dias / 30);
  if (meses < 12) return `hace ${meses} mes${meses > 1 ? "es" : ""}`;
  return `hace ${Math.round(meses / 12)} a`;
}

export function formatFecha(fechaISO: string | null): string {
  if (!fechaISO) return "—";
  return new Intl.DateTimeFormat("es-DO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(fechaISO + (fechaISO.length === 10 ? "T00:00:00" : "")));
}
