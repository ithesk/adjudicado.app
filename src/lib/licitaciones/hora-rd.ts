// El cierre en hora de República Dominicana.
//
// La columna `cierre` es timestamptz: guarda el INSTANTE. Las 09:00 de RD
// llegan de la DGCP como "…T09:00:00-04:00" y vuelven de la base como
// "…T13:00:00+00:00". Recortar ese texto (slice) enseña la hora UTC, cuatro
// horas de más. Todo lo que pinte o edite el cierre pasa por aquí.
//
// RD no tiene horario de verano: el desfase es siempre -04:00, así que basta
// aritmética fija (sin depender de la zona horaria del navegador).

const DESFASE_RD_MS = 4 * 60 * 60 * 1000;

/** Instante (ms) de un cierre ISO, o null si no se entiende. */
export function instanteCierre(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** "YYYY-MM-DDTHH:mm" en hora de RD: el valor de un <input type="datetime-local">. */
export function cierreLocalRd(iso: string | null | undefined): string {
  const ms = instanteCierre(iso);
  if (ms === null) return "";
  return new Date(ms - DESFASE_RD_MS).toISOString().slice(0, 16);
}

/** "dd/mm HH:mm" en hora de RD, para cabeceras y avisos. */
export function cierreCortoRd(iso: string | null | undefined): string {
  const local = cierreLocalRd(iso);
  if (!local) return "";
  return `${local.slice(8, 10)}/${local.slice(5, 7)} ${local.slice(11, 16)}`;
}

/** Lo que escribe el usuario (hora de RD, sin zona) → ISO con -04:00. */
export function cierreDesdeLocalRd(local: string | null | undefined): string | null {
  if (!local) return null;
  const m = local.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}:00-04:00` : null;
}

export interface Restante {
  /** Milisegundos hasta el cierre; negativo si ya pasó. */
  ms: number;
  dias: number;
  horas: number;
  minutos: number;
  segundos: number;
}

/** Desglose del tiempo que falta (o que ha pasado, en valor absoluto). */
export function restante(cierreMs: number, ahoraMs: number): Restante {
  const ms = cierreMs - ahoraMs;
  let s = Math.floor(Math.abs(ms) / 1000);
  const dias = Math.floor(s / 86_400);
  s -= dias * 86_400;
  const horas = Math.floor(s / 3600);
  s -= horas * 3600;
  const minutos = Math.floor(s / 60);
  return { ms, dias, horas, minutos, segundos: s - minutos * 60 };
}

const dos = (n: number) => String(n).padStart(2, "0");

/**
 * Texto del contador: "3d 04:12:09", "04:12:09" el último día, o
 * "Cerrado hace 2h 05m" cuando ya pasó. `segundos: false` lo deja en minutos
 * (la lista, donde un segundero en cada fila distrae).
 */
export function textoRestante(r: Restante, segundos = true): string {
  if (r.ms <= 0) {
    if (r.dias > 0) return `Cerrado hace ${r.dias}d ${r.horas}h`;
    if (r.horas > 0) return `Cerrado hace ${r.horas}h ${dos(r.minutos)}m`;
    return `Cerrado hace ${r.minutos}m`;
  }
  const reloj = segundos
    ? `${dos(r.horas)}:${dos(r.minutos)}:${dos(r.segundos)}`
    : `${r.horas}h ${dos(r.minutos)}m`;
  return r.dias > 0 ? `${r.dias}d ${reloj}` : reloj;
}

export type NivelCierre = "vencido" | "rojo" | "ambar" | "verde";

/** Semáforo por horas reales (no por días de calendario). */
export function nivelCierre(r: Restante): NivelCierre {
  if (r.ms <= 0) return "vencido";
  const horas = r.ms / 3_600_000;
  if (horas <= 24) return "rojo";
  if (horas <= 72) return "ambar";
  return "verde";
}
