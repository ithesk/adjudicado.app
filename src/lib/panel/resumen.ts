// Resumen de los procesos en preparación para un panel de solo lectura (el
// Kindle del taller). Es una función pura: la ruta trae las filas de la base
// y aquí solo se decide qué se muestra, para poder probarlo sin Supabase.

/** Estados en los que todavía queda trabajo antes de una fecha límite. */
export const ESTADOS_EN_PREPARACION = [
  "captura",
  "calificacion",
  "costeo",
  "armado",
  "listo",
  "subsanacion",
] as const;

export interface FilaProceso {
  id: string;
  codigo: string;
  objeto: string | null;
  estado: string;
  cierre: string | null;
  institucion: { nombre: string | null; siglas: string | null } | null;
}

export interface FilaRequisito {
  proceso_id: string;
  nombre: string;
  estado: string;
  /** Lo cubre un documento vigente de la empresa aunque siga «pendiente». */
  cubierto: boolean;
}

export interface FilaItem {
  proceso_id: string;
  ofertamos: boolean | null;
  cotizado: boolean;
}

export interface FilaSubsanacion {
  proceso_id: string;
  fecha_limite: string | null;
}

export interface ProcesoPanel {
  codigo: string;
  objeto: string;
  institucion: string;
  estado: string;
  /** La fecha que manda: la de subsanación si hay una abierta, si no el cierre. */
  limite: string;
  tipo_limite: "cierre" | "subsanacion";
  requisitos: { listos: number; total: number; faltan: string[] };
  items: { cotizados: number; total: number };
}

export interface ResumenPanel {
  generado: string;
  procesos: ProcesoPanel[];
  /** En preparación pero con la fecha ya pasada: estado sin actualizar. */
  vencidos: number;
}

/** Cuántos requisitos pendientes se listan por proceso (la pantalla es pequeña). */
const MAX_FALTAN = 8;

export function resumirProcesos(
  procesos: FilaProceso[],
  requisitos: FilaRequisito[],
  items: FilaItem[],
  subsanaciones: FilaSubsanacion[],
  ahora: Date,
): ResumenPanel {
  const porProceso = <T extends { proceso_id: string }>(filas: T[]) => {
    const m = new Map<string, T[]>();
    for (const f of filas) m.set(f.proceso_id, [...(m.get(f.proceso_id) ?? []), f]);
    return m;
  };
  const reqs = porProceso(requisitos);
  const its = porProceso(items);
  const subs = porProceso(subsanaciones);

  let vencidos = 0;
  const salida: ProcesoPanel[] = [];

  for (const p of procesos) {
    // En subsanación manda el plazo de la subsanación abierta más próxima.
    const fechasSub = (subs.get(p.id) ?? [])
      .map((s) => s.fecha_limite)
      .filter((f): f is string => !!f)
      .sort();
    const usaSub = p.estado === "subsanacion" && fechasSub.length > 0;
    const limite = usaSub ? fechasSub[0] : p.cierre;
    if (!limite) continue;
    if (new Date(limite).getTime() <= ahora.getTime()) {
      vencidos++;
      continue;
    }

    const rs = reqs.get(p.id) ?? [];
    const hecho = (r: FilaRequisito) => r.estado !== "pendiente" || r.cubierto;
    const ofertados = (its.get(p.id) ?? []).filter((i) => i.ofertamos !== false);

    salida.push({
      codigo: p.codigo,
      objeto: p.objeto ?? "",
      institucion: p.institucion?.siglas || p.institucion?.nombre || "",
      estado: p.estado,
      limite,
      tipo_limite: usaSub ? "subsanacion" : "cierre",
      requisitos: {
        listos: rs.filter(hecho).length,
        total: rs.length,
        faltan: rs.filter((r) => !hecho(r)).slice(0, MAX_FALTAN).map((r) => r.nombre),
      },
      items: { cotizados: ofertados.filter((i) => i.cotizado).length, total: ofertados.length },
    });
  }

  salida.sort((a, b) => a.limite.localeCompare(b.limite));
  return { generado: ahora.toISOString(), procesos: salida, vencidos };
}
