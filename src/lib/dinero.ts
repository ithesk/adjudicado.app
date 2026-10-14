// «¿Dónde está el dinero?» — el dinero vivo de las órdenes repartido por la
// fase en la que está parado, el ritmo mensual (lo que entra y lo que se
// cobra) frente al año anterior y a la meta, y quién nos lo debe. Es lo que
// la barra de métricas no contesta: la barra da cifras sueltas; esto las
// pone en una sola línea de izquierda a derecha, en el orden en que el
// dinero avanza hacia la cuenta, y dice a quién hay que llamar.
//
// Las fechas salen del HISTORIAL de estados (orden_hist) cuando existe:
// cuándo se facturó, cuándo se cobró. Sin historial (órdenes anteriores a
// él), el último cambio de la orden hace de aproximación, como antes.
//
// Módulo puro (sin imports de servidor): se calcula sobre las órdenes que la
// bandeja ya carga, y se testea con fechas fijas.

import {
  desdeEstado,
  diasRestantes,
  esViva,
  normalizarEntidad,
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

const COBRADO: Estado[] = ["cobrado", "cerrado"];
const POR_COBRAR: Estado[] = ["facturado", "libramiento"];
const SIN_FACTURAR: Estado[] = ["entregado", "listo_facturar"];
const POR_ENTREGAR: Estado[] = ["orden_recibida", "en_coordinacion"];

export interface TramoDinero extends FaseDef {
  n: number;
  monto: number;
  // Parte del dinero vivo (0-100), para el ancho del segmento.
  pct: number;
  // Órdenes con el plazo dominante ya vencido.
  vencidas: number;
  // Días que lleva esperando la orden más vieja del tramo (desde que entró
  // en él). null si el tramo está vacío.
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

// Un acumulado del año con su comparación: el mismo periodo (1 de enero
// hasta hoy) del año anterior, y la variación en %.
export interface Acumulado {
  monto: number;
  n: number;
  anterior: number;
  anteriorN: number;
  // null cuando el año anterior fue 0 (no hay con qué comparar).
  variacionPct: number | null;
}

// Una institución y lo que tiene de nuestro dinero.
export interface InstitucionDinero {
  institucion: string;
  // Facturado o en libramiento: lo que nos DEBE.
  porCobrar: number;
  porCobrarN: number;
  // Entregado y aún sin factura: lo que todavía no le hemos cobrado.
  sinFacturar: number;
  sinFacturarN: number;
  // Aún por entregar.
  porEntregar: number;
  porEntregarN: number;
  // Días que lleva esperando pago la factura más vieja. null si no debe.
  esperaMax: number | null;
  // Cuánto suele tardar en pagar (mediana de días factura → cobro de sus
  // órdenes cobradas con historial). null si no hay datos.
  pagaEnDias: number | null;
  // Órdenes cobradas que respaldan pagaEnDias.
  pagosMedidos: number;
}

export interface Dinero {
  tramos: TramoDinero[];
  totalVivo: number;
  vivasN: number;
  cobradoMes: number;
  cobradoMesN: number;
  cobradoAnio: Acumulado;
  generadoAnio: Acumulado;
  // La meta anual (si hay) y el % alcanzado con lo que entró en el año.
  metaAnual: number | null;
  metaPct: number | null;
  // Últimos 6 meses, del más viejo al actual.
  meses: MesDinero[];
  // Quién nos debe, de más a menos.
  instituciones: InstitucionDinero[];
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function claveMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function claveDia(d: Date): string {
  return `${claveMes(d)}-${String(d.getDate()).padStart(2, "0")}`;
}

// Mes de una fecha ISO ("2026-10-13" o "2026-10-13T15:00:00Z"), sin pasar
// por Date: las fechas de la OC son días sueltos y un Date los correría al
// día anterior en zonas negativas.
function mesDeIso(iso: string | null): string | null {
  if (!iso || iso.length < 7) return null;
  return iso.slice(0, 7);
}

function diaDeIso(iso: string | null): string | null {
  if (!iso || iso.length < 10) return null;
  return iso.slice(0, 10);
}

// Cuándo entró la orden: la fecha de la OC manda; sin ella, cuándo se creó.
function fechaEntrada(o: Orden): string | null {
  return o.fecha_oc ?? o.created_at;
}

// Cuándo se cobró: el historial si lo hay; si no, el último cambio.
function fechaCobro(o: Orden): string {
  return desdeEstado(o, COBRADO) ?? o.updated_at;
}

// Cuándo se facturó (la racha vigente de facturado/libramiento, o la última
// factura antes del cobro). Sin historial, null: no se inventa.
function fechaFactura(o: Orden): string | null {
  if (!o.hist?.length) return null;
  let desde: string | null = null;
  let enRacha = false;
  for (const c of o.hist) {
    if (POR_COBRAR.includes(c.estado)) {
      if (!enRacha) desde = c.desde;
      enRacha = true;
    } else if (!COBRADO.includes(c.estado)) {
      // Volvió atrás (p. ej. a entregado): la factura anterior no cuenta.
      enRacha = false;
      desde = null;
    } else {
      enRacha = false;
    }
  }
  return desde;
}

function diasEntre(desdeIso: string, hastaIso: string | Date): number {
  const a = new Date(desdeIso).getTime();
  const b = typeof hastaIso === "string" ? new Date(hastaIso).getTime() : hastaIso.getTime();
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

const mediana = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : Math.round((o[m - 1] + o[m]) / 2);
};

const suma = (xs: Orden[]) => xs.reduce((s, o) => s + (o.monto ?? 0), 0);

function acumulado(actual: Orden[], anterior: Orden[]): Acumulado {
  const monto = suma(actual);
  const ant = suma(anterior);
  return {
    monto,
    n: actual.length,
    anterior: ant,
    anteriorN: anterior.length,
    variacionPct: ant > 0 ? Math.round(((monto - ant) / ant) * 100) : null,
  };
}

export function dondeEstaElDinero(
  ordenes: Orden[],
  opciones: { hoy?: Date; metaAnual?: number | null } = {},
): Dinero {
  const hoy = opciones.hoy ?? new Date();
  const metaAnual = opciones.metaAnual ?? null;

  const vivas = ordenes.filter((o) => esViva(o.estado));
  const totalVivo = suma(vivas);

  const tramos: TramoDinero[] = FASES.map((f) => {
    const del = vivas.filter((o) => f.estados.includes(o.estado));
    const monto = suma(del);
    const vencidas = del.filter((o) => {
      const d = diasRestantes(plazoDominante(o));
      return d !== null && d < 0;
    }).length;
    const esperaMax = del.length
      ? Math.max(...del.map((o) => diasEntre(desdeEstado(o, f.estados) ?? o.updated_at, hoy)))
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
  // El mismo periodo del año pasado: del 1 de enero a la fecha de hoy.
  const anioAnt = String(hoy.getFullYear() - 1);
  const hastaAnt = claveDia(new Date(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate()));
  const enPeriodoAnterior = (iso: string | null) => {
    const d = diaDeIso(iso);
    return d !== null && d.startsWith(anioAnt) && d <= hastaAnt;
  };

  const cobradas = ordenes.filter((o) => COBRADO.includes(o.estado));
  const cobradoMesL = cobradas.filter((o) => mesDeIso(fechaCobro(o)) === mesActual);

  const cobradoAnio = acumulado(
    cobradas.filter((o) => (mesDeIso(fechaCobro(o)) ?? "").startsWith(anio)),
    cobradas.filter((o) => enPeriodoAnterior(fechaCobro(o))),
  );
  const generadoAnio = acumulado(
    ordenes.filter((o) => (mesDeIso(fechaEntrada(o)) ?? "").startsWith(anio)),
    ordenes.filter((o) => enPeriodoAnterior(fechaEntrada(o))),
  );

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
    cobradoAnio,
    generadoAnio,
    metaAnual,
    metaPct:
      metaAnual && metaAnual > 0
        ? Math.round((generadoAnio.monto / metaAnual) * 100)
        : null,
    meses,
    instituciones: porInstitucion(ordenes, hoy),
  };
}

// Quién nos debe: cada institución con dinero vivo nuestro, de más a menos
// por cobrar. Con el historial, además, cuánto suele tardar en pagar.
export function porInstitucion(ordenes: Orden[], hoy = new Date()): InstitucionDinero[] {
  const grupos = new Map<string, { nombre: string; ordenes: Orden[] }>();
  for (const o of ordenes) {
    const nombre = o.institucion?.trim() || "Sin institución";
    const clave = normalizarEntidad(nombre);
    const g = grupos.get(clave) ?? { nombre, ordenes: [] };
    g.ordenes.push(o);
    grupos.set(clave, g);
  }

  const filas: InstitucionDinero[] = [];
  for (const g of grupos.values()) {
    const porCobrarL = g.ordenes.filter((o) => POR_COBRAR.includes(o.estado));
    const sinFacturarL = g.ordenes.filter((o) => SIN_FACTURAR.includes(o.estado));
    const porEntregarL = g.ordenes.filter((o) => POR_ENTREGAR.includes(o.estado));
    if (!porCobrarL.length && !sinFacturarL.length && !porEntregarL.length) continue;

    const esperas = porCobrarL.map((o) =>
      diasEntre(fechaFactura(o) ?? desdeEstado(o, POR_COBRAR) ?? o.updated_at, hoy),
    );
    // Solo cuentan los cobros con las DOS fechas reales (factura y cobro).
    const pagos = g.ordenes
      .filter((o) => COBRADO.includes(o.estado))
      .map((o) => {
        const f = fechaFactura(o);
        const c = desdeEstado(o, COBRADO);
        return f && c ? diasEntre(f, c) : null;
      })
      .filter((d): d is number => d !== null);

    filas.push({
      institucion: g.nombre,
      porCobrar: suma(porCobrarL),
      porCobrarN: porCobrarL.length,
      sinFacturar: suma(sinFacturarL),
      sinFacturarN: sinFacturarL.length,
      porEntregar: suma(porEntregarL),
      porEntregarN: porEntregarL.length,
      esperaMax: esperas.length ? Math.max(...esperas) : null,
      pagaEnDias: mediana(pagos),
      pagosMedidos: pagos.length,
    });
  }

  return filas.sort(
    (a, b) =>
      b.porCobrar - a.porCobrar ||
      b.sinFacturar - a.sinFacturar ||
      b.porEntregar - a.porEntregar,
  );
}
