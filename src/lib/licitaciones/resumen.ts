// El resumen de las licitaciones para la bandeja y la cabecera de la lista:
// cuántas hay en cada tramo del embudo y CUÁNTO DINERO hay en cada uno
// (lo cotizado en las que se trabajan, lo que está en juego en las
// sometidas, lo ganado este año), más los procesos con el reloj corriendo.
//
// Módulo puro (sin imports de servidor): se calcula sobre lo que las páginas
// ya cargan y se testea con fechas fijas.

import { diasRestantes, nivelUrgencia, type NivelUrgencia } from "@/lib/types";
import type { EstadoLicitacion, LicProceso } from "./tipos";

// Etapas en las que el proceso TODAVÍA es nuestro trabajo.
export const EN_TRABAJO: EstadoLicitacion[] = ["captura", "calificacion", "costeo", "armado", "listo"];
// Presentado: la decisión es de la entidad, el dinero está en juego.
export const EN_JUEGO: EstadoLicitacion[] = ["sometido", "subsanacion"];

export interface Tramo {
  n: number;
  monto: number;
  // Cuántos de los n tienen monto (no todo está cotizado).
  conMonto: number;
}

export interface ProcesoVivo {
  id: string;
  codigo: string;
  objeto: string | null;
  modalidad: string;
  estado: EstadoLicitacion;
  institucion_id: string | null;
  monto: number | null;
  // Fecha límite de la subsanación abierta, si la hay (ese reloj manda).
  subsanacion: string | null;
  dias: number | null;
  nivel: NivelUrgencia;
}

export interface ResumenLicitaciones {
  enTrabajo: Tramo;
  listas: number;
  enJuego: Tramo;
  subsanacion: number;
  // Adjudicadas (todas y las de este año) — lo que el embudo produjo.
  adjudicadas: Tramo;
  adjudicadasAnio: Tramo;
  perdidas: number;
  // (adjudicadas / decididas) × 100 sobre adjudicadas + perdidas. null si
  // aún no hay ninguna decidida.
  tasaExito: number | null;
  decididas: number;
  // Los procesos con reloj, del más urgente al más holgado.
  vivos: ProcesoVivo[];
}

export interface EntradaResumen {
  procesos: LicProceso[];
  // proceso_id → total de la oferta (con ITBIS), solo para los cotizados.
  montos: Record<string, number>;
  // proceso_id → fecha límite de la subsanación abierta.
  subsanaciones: Record<string, string>;
  hoy?: Date;
}

function tramo(ps: LicProceso[], montos: Record<string, number>): Tramo {
  let monto = 0;
  let conMonto = 0;
  for (const p of ps) {
    const m = montos[p.id];
    if (m !== undefined && m > 0) {
      monto += m;
      conMonto++;
    }
  }
  return { n: ps.length, monto, conMonto };
}

// El cierre es fecha+hora; para el contador de días basta el día.
function diasAl(iso: string | null): number | null {
  return diasRestantes(iso ? iso.slice(0, 10) : null);
}

export function resumenLicitaciones({
  procesos,
  montos,
  subsanaciones,
  hoy = new Date(),
}: EntradaResumen): ResumenLicitaciones {
  const anio = String(hoy.getFullYear());
  const de = (estados: EstadoLicitacion[]) => procesos.filter((p) => estados.includes(p.estado));

  const adjudicadas = de(["adjudicado"]);
  const perdidas = de(["perdido"]).length;
  const decididas = adjudicadas.length + perdidas;

  const vivos: ProcesoVivo[] = procesos
    .filter((p) => EN_TRABAJO.includes(p.estado) || EN_JUEGO.includes(p.estado))
    .map((p) => {
      const sub = subsanaciones[p.id] ?? null;
      // Una vez sometido, el cierre ya pasó: solo la subsanación tiene reloj.
      const dias = sub ? diasAl(sub) : EN_TRABAJO.includes(p.estado) ? diasAl(p.cierre) : null;
      return {
        id: p.id,
        codigo: p.codigo,
        objeto: p.objeto,
        modalidad: p.modalidad,
        estado: p.estado,
        institucion_id: p.institucion_id,
        monto: montos[p.id] ?? null,
        subsanacion: sub,
        dias,
        nivel: nivelUrgencia(dias),
      };
    })
    .sort((a, b) => {
      if (a.dias === null && b.dias === null) return 0;
      if (a.dias === null) return 1;
      if (b.dias === null) return -1;
      return a.dias - b.dias;
    });

  return {
    enTrabajo: tramo(de(EN_TRABAJO), montos),
    listas: de(["listo"]).length,
    enJuego: tramo(de(EN_JUEGO), montos),
    subsanacion: de(["subsanacion"]).length,
    adjudicadas: tramo(adjudicadas, montos),
    adjudicadasAnio: tramo(
      // Sin fecha de adjudicación propia: el último cambio de un proceso
      // adjudicado es, salvo edición posterior, cuando se marcó ganado.
      adjudicadas.filter((p) => p.updated_at.startsWith(anio)),
      montos,
    ),
    perdidas,
    tasaExito: decididas ? Math.round((adjudicadas.length / decididas) * 100) : null,
    decididas,
    vivos,
  };
}
