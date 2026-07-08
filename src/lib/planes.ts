// Catálogo de planes — fuente ÚNICA para la landing (`/`) y el registro
// (`/registro`). Los precios están en RD$/mes y son fáciles de ajustar aquí sin
// tocar la UI. La facturación (cobro real) es una capa aparte; por ahora el
// registro solo deja registrado el plan elegido y arranca un período de prueba.

export type PlanId = "equipo" | "empresa" | "corporativo";

export type EstadoCuenta = "prueba" | "activa" | "suspendida" | "cancelada";

export interface Plan {
  id: PlanId;
  nombre: string;
  /** RD$/mes. `null` = precio a medida (se cotiza). */
  precioMensual: number | null;
  /** Una línea que resume para quién es. */
  resumen: string;
  /** El plan que queremos empujar (se resalta en la tabla). */
  destacado?: boolean;
  /** Límites del plan. `null` = sin límite. Base para el enforcement futuro. */
  limites: {
    miembros: number | null;
    ordenesVivas: number | null;
    ocrMes: number | null;
  };
  /** Qué incluye, en el orden en que se muestra. */
  incluye: string[];
}

// Días de prueba al crear una empresa nueva.
export const DIAS_PRUEBA = 14;

export const PLANES: Plan[] = [
  {
    id: "equipo",
    nombre: "Equipo",
    precioMensual: 2500,
    resumen: "Para el equipo pequeño que da seguimiento a sus adjudicaciones.",
    limites: { miembros: 3, ordenesVivas: 15, ocrMes: 30 },
    incluye: [
      "Hasta 3 usuarios",
      "Hasta 15 órdenes vivas a la vez",
      "30 lecturas de OC con IA al mes",
      "Tablero de triage por urgencia",
      "Bitácora, documentos y precios",
    ],
  },
  {
    id: "empresa",
    nombre: "Empresa",
    precioMensual: 5900,
    resumen: "Para el revendedor que maneja varias licitaciones en paralelo.",
    destacado: true,
    limites: { miembros: 10, ordenesVivas: null, ocrMes: 150 },
    incluye: [
      "Hasta 10 usuarios",
      "Órdenes vivas ilimitadas",
      "150 lecturas de OC con IA al mes",
      "Todo lo del plan Equipo",
      "Integración con Odoo y correo entrante",
      "Grupos y equipos de trabajo",
    ],
  },
  {
    id: "corporativo",
    nombre: "Corporativo",
    precioMensual: null,
    resumen: "Para operaciones grandes con necesidades a medida.",
    limites: { miembros: null, ordenesVivas: null, ocrMes: null },
    incluye: [
      "Usuarios ilimitados",
      "Lecturas de OC con IA a medida",
      "Todo lo del plan Empresa",
      "Onboarding y soporte prioritario",
      "Acuerdos de nivel de servicio (SLA)",
    ],
  },
];

export const PLAN_POR_DEFECTO: PlanId = "empresa";

export function esPlanValido(id: string | null | undefined): id is PlanId {
  return !!id && PLANES.some((p) => p.id === id);
}

export function planPorId(id: string | null | undefined): Plan | undefined {
  return PLANES.find((p) => p.id === id);
}

// Formatea un precio mensual en RD$ (o "A medida" si es a cotizar).
export function precioLegible(plan: Plan): string {
  if (plan.precioMensual === null) return "A medida";
  return "RD$" + plan.precioMensual.toLocaleString("es-DO");
}
