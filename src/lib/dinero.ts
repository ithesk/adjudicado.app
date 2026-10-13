// «¿Dónde está el dinero?» — el dinero vivo de las órdenes repartido por la
// fase en la que está parado, más el ritmo mensual (lo que entra y lo que se
// cobra). Es lo que la barra de métricas no contesta: la barra da cifras
// sueltas; esto las pone en una sola línea de izquierda a derecha, en el
// orden en que el dinero avanza hacia la cuenta.
//
// Módulo puro (sin imports de servidor): se calcula sobre las órdenes que la
// bandeja ya carga, y se testea con fechas fijas.

import {
  diasRestantes,
  esViva,
  plazoDominante,
  type Estado,
  type Orden,
} from "@/lib/types";

export type FaseDinero = "por_entregar" | "sin_facturar" | "facturado" | "libramiento";

export interface FaseDef {
  key: FaseDinero;
  label: string;
  // En cristiano: qué tiene que pasar para que el dinero avance.
  siguiente: string;
  estados: Estado[];
  // A dónde lleva el clic (filtro de la bandeja).
  href: string;
  // Color del segmento en la barra — mismo lenguaje que el tablero.
  color: string;
}

export const FASES: FaseDef[] = [
  {
    key: "por_entregar",
    label: "Por entregar",
    siguiente: "falta entregar",
    estados: ["orden_recibida", "en_coordinacion"],
    href: "/?filtro=pendiente_entrega",
    color: "bg-muted/40",
  },
  {
    key: "sin_facturar",
    label: "Entregado sin facturar",
    siguiente: "falta facturar",
    estados: ["entregado", "listo_facturar"],
    href: "/?filtro=atascado",
    color: "bg-warn",
  },
  {
    key: "facturado",
    label: "Facturado",
    siguiente: "espera libramiento",
    estados: ["facturado"],
    href: "/?filtro=facturado",
    color: "bg-ok",
  },
  {
    key: "libramiento",
    label: "En libramiento",
    siguiente: "espera el pago",
    estados: ["libramiento"],
    href: "/?filtro=en_libramiento",
    color: "bg-primary",
  },
];

export interface TramoDinero extends FaseDef {
  n: number;
  monto: number;
  // Parte del dinero vivo (0-100), para el ancho del segmento.
  pct: number;
  // Órdenes con el plazo dominante ya vencido.
  vencidas: number;
  // Días que lleva esperando la orden más vieja del tramo (desde su último
  // cambio de estado). null si el tramo está vacío.
  esperaMax: number | null;
}

export interface MesDinero {
  // "2026-10"
  clave: string;
  // "oct"
  label: string;
  // Lo que ENTRÓ ese mes (monto de las órdenes por fecha de la OC).
  generado: number;
  generadoN: number;
  // Lo que se COBRÓ ese mes.
  cobrado: number;
  cobradoN: number;
}

export interface Dinero {
  tramos: TramoDinero[];
  totalVivo: number;
  vivasN: number;
  cobradoMes: number;
  cobradoMesN: number;
  cobradoAnio: number;
  cobradoAnioN: number;
  generadoAnio: number;
  generadoAnioN: number;
  // Últimos 6 meses, del más viejo al actual.
  meses: MesDinero[];
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function claveMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Mes de una fecha ISO ("2026-10-13" o "2026-10-13T15:00:00Z"), sin pasar
// por Date: las fechas de la OC son días sueltos y un Date los correría al
// día anterior en zonas negativas.
function mesDeIso(iso: string | null): string | null {
  if (!iso || iso.length < 7) return null;
  return iso.slice(0, 7);
}

// Cuándo entró la orden: la fecha de la OC manda; sin ella, cuándo se creó.
function fechaEntrada(o: Orden): string | null {
  return o.fecha_oc ?? mesDeIso(o.created_at);
}

// Cuándo se cobró. No hay columna propia: el último cambio de una orden
// cobrada/cerrada es, salvo edición posterior, el momento del cobro.
function fechaCobro(o: Orden): string | null {
  return o.updated_at;
}

function diasDesde(iso: string, hoy: Date): number {
  const t = new Date(iso).getTime();
  return Math.max(0, Math.floor((hoy.getTime() - t) / 86_400_000));
}

export function dondeEstaElDinero(ordenes: Orden[], hoy = new Date()): Dinero {
  const vivas = ordenes.filter((o) => esViva(o.estado));
  const totalVivo = vivas.reduce((s, o) => s + (o.monto ?? 0), 0);

  const tramos: TramoDinero[] = FASES.map((f) => {
    const del = vivas.filter((o) => f.estados.includes(o.estado));
    const monto = del.reduce((s, o) => s + (o.monto ?? 0), 0);
    const vencidas = del.filter((o) => {
      const d = diasRestantes(plazoDominante(o));
      return d !== null && d < 0;
    }).length;
    const esperaMax = del.length
      ? Math.max(...del.map((o) => diasDesde(o.updated_at, hoy)))
      : null;
    return {
      ...f,
      n: del.length,
      monto,
      pct: totalVivo > 0 ? Math.round((monto / totalVivo) * 1000) / 10 : 0,
      vencidas,
      esperaMax,
    };
  });

  const mesActual = claveMes(hoy);
  const anio = String(hoy.getFullYear());

  const cobradas = ordenes.filter((o) => o.estado === "cobrado" || o.estado === "cerrado");
  const cobradoMesL = cobradas.filter((o) => mesDeIso(fechaCobro(o)) === mesActual);
  const cobradoAnioL = cobradas.filter((o) => (mesDeIso(fechaCobro(o)) ?? "").startsWith(anio));
  const generadoAnioL = ordenes.filter((o) => (mesDeIso(fechaEntrada(o)) ?? "").startsWith(anio));

  const suma = (xs: Orden[]) => xs.reduce((s, o) => s + (o.monto ?? 0), 0);

  // Los 6 meses, del más viejo al actual.
  const meses: MesDinero[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const clave = claveMes(d);
    const entradas = ordenes.filter((o) => mesDeIso(fechaEntrada(o)) === clave);
    const cobros = cobradas.filter((o) => mesDeIso(fechaCobro(o)) === clave);
    meses.push({
      clave,
      label: MESES_CORTOS[d.getMonth()],
      generado: suma(entradas),
      generadoN: entradas.length,
      cobrado: suma(cobros),
      cobradoN: cobros.length,
    });
  }

  return {
    tramos,
    totalVivo,
    vivasN: vivas.length,
    cobradoMes: suma(cobradoMesL),
    cobradoMesN: cobradoMesL.length,
    cobradoAnio: suma(cobradoAnioL),
    cobradoAnioN: cobradoAnioL.length,
    generadoAnio: suma(generadoAnioL),
    generadoAnioN: generadoAnioL.length,
    meses,
  };
}
