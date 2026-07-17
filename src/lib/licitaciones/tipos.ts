// Tipos de las filas de la base y helpers de presentación del módulo de
// Licitaciones. Sin imports de servidor: se usa en cliente y servidor.

export type EstadoLicitacion =
  | "captura"
  | "calificacion"
  | "costeo"
  | "armado"
  | "listo"
  | "sometido"
  | "subsanacion"
  | "adjudicado"
  | "perdido"
  | "descartado";

export const ESTADOS_LICITACION: EstadoLicitacion[] = [
  "captura",
  "calificacion",
  "costeo",
  "armado",
  "listo",
  "sometido",
  "subsanacion",
  "adjudicado",
  "perdido",
  "descartado",
];

export const ESTADO_LIC_LABEL: Record<EstadoLicitacion, string> = {
  captura: "Captura",
  calificacion: "Calificación",
  costeo: "Costeo",
  armado: "Armado",
  listo: "Listo",
  sometido: "Sometido",
  subsanacion: "Subsanación",
  adjudicado: "Adjudicado",
  perdido: "Perdido",
  descartado: "Descartado",
};

// Qué se hace en cada etapa, en cristiano (tooltips de la línea de tiempo).
export const ESTADO_LIC_DESCRIPCION: Record<EstadoLicitacion, string> = {
  captura: "Cargar el pliego: los datos del proceso, los requisitos y los ítems",
  calificacion: "Decidir si nos presentamos y qué ítems ofertamos",
  costeo: "Cotizar: costos, márgenes y precios de cada línea",
  armado: "Armar el paquete: generar los formularios, juntar los documentos, firmar y sellar",
  listo: "Paquete completo y verificado, listo para someter",
  sometido: "Oferta presentada ante la entidad",
  subsanacion: "La entidad pidió corregir algo subsanable — hay plazo, vigilarlo",
  adjudicado: "Ganamos: de aquí nace la orden de compra",
  perdido: "No ganamos este proceso",
  descartado: "Decidimos no presentarnos",
};

export const MODALIDAD_LABEL: Record<string, string> = {
  CM: "Compra menor",
  CD: "Compra directa",
  LPN: "Licitación pública nacional",
  CP: "Comparación de precios",
  SB: "Subasta inversa",
  OTRO: "Otra",
};

export type RolFirmante = "gerente_general" | "gerente_ventas";

export const ROL_FIRMANTE_LABEL: Record<RolFirmante, string> = {
  gerente_general: "Gerente General",
  gerente_ventas: "Gerente de Ventas",
};

export interface EmpresaPerfil {
  org_id: string;
  nombre_legal: string;
  rnc: string | null;
  rpe: string | null;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  tasa_usd_dop: number | null;
  tasa_fecha: string | null;
  margen_pct: number;
  margen_modo: "markup" | "margen";
  itbis_pct: number;
  updated_at: string;
}

export interface LicFirmante {
  org_id: string;
  rol: RolFirmante;
  nombre: string;
  cedula: string | null;
  cargo: string | null;
  firma_doc_id: string | null;
  sello_doc_id: string | null;
}

export interface LicProceso {
  id: string;
  org_id: string;
  institucion_id: string | null;
  codigo: string;
  modalidad: string;
  objeto: string | null;
  moneda: "DOP" | "USD";
  adjudicacion: "item" | "lote" | "total";
  criterio: "menor_precio" | "calidad_precio" | "calidad";
  plazo_pago_dias: number | null;
  cierre: string | null;
  estado: EstadoLicitacion;
  tasa_usd_dop: number | null;
  margen_pct: number | null;
  itbis_pct: number | null;
  notas: string | null;
  creado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface LicLote {
  id: string;
  proceso_id: string;
  numero: number;
  nombre: string | null;
}

export interface LicItem {
  id: string;
  org_id: string;
  proceso_id: string;
  lote_id: string | null;
  numero: number;
  spec_cruda: string;
  cantidad: number;
  unidad: string;
  marca: string | null;
  modelo: string | null;
  parte: string | null;
  descripcion: string | null;
  ofertamos: boolean;
  motivo_descarte: string | null;
  suplidor_id: string | null;
  sku: string | null;
  costo_usd: number | null;
  tasa: number | null;
  margen_pct: number | null;
  margen_modo: "markup" | "margen" | null;
  precio_unitario: number | null;
  itbis_aplica: boolean;
  orden_indice: number;
}

export interface LicRequisito {
  id: string;
  org_id: string;
  proceso_id: string;
  codigo: string;
  nombre: string;
  subsanable: boolean;
  fuente: string | null;
  firmante_rol: RolFirmante | "ninguno";
  origen: "generado" | "plantilla_oficial" | "documento_empresa" | "externo";
  estado: "pendiente" | "listo";
  documento_empresa_id: string | null;
  storage_path: string | null;
  // Valores de las variables "se pregunta al generar" de la plantilla de la
  // org (clave → valor), propios de ESTE proceso.
  datos: Record<string, string>;
  orden_indice: number;
}

// El detalle completo que consume la Bid Room.
export interface ProcesoDetalle {
  proceso: LicProceso;
  lotes: LicLote[];
  items: LicItem[];
  requisitos: LicRequisito[];
  institucion: { id: string; nombre: string; siglas: string | null } | null;
}

// Cuántos requisitos críticos faltan (lo que el gate de la Fase 5 bloquea).
export function noSubsanablesPendientes(requisitos: LicRequisito[]): number {
  return requisitos.filter((r) => !r.subsanable && r.estado === "pendiente")
    .length;
}
