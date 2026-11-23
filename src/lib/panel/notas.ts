// Lo que el Kindle escribe en las notas del proceso (lic_proceso.notas, el
// mismo texto que se ve y edita en la Bid Room). Funciones puras: la ruta lee
// y guarda; aquí solo se decide cómo queda el texto.
//
//  · Cada nota es una viñeta al final:  «- Kindle 23/11 14:05 · Falta firma»
//  · Los bloques de trabajo NO van uno por línea (llenarían las notas): hay
//    una sola línea de resumen que se actualiza:
//    «⏱ Trabajo en el Kindle: 2 h 15 min en 4 bloques · último 23/11/2026 13:00»
//
// Las dos operaciones toleran reintentos: el Kindle guarda en cola lo que no
// pudo enviar y lo reenvía, y una respuesta perdida no debe duplicar nada.

/** Largo máximo de una nota (la pantalla del Kindle y el teclado no dan para más). */
export const LIMITE_NOTA = 500;

/** Cuántas líneas de notas se mandan al panel (las últimas). */
const LINEAS_PANEL = 8;
const LARGO_LINEA_PANEL = 280;

const ZONA = "America/Santo_Domingo"; // UTC-4 todo el año, sin horario de verano
const RE_TRABAJO =
  /^⏱ Trabajo en el Kindle: (?:(\d+) h ?)?(?:(\d+) min)? en (\d+) bloques? · último (\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/;

function partesRD(d: Date) {
  const f = new Intl.DateTimeFormat("es-DO", {
    timeZone: ZONA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const v = (t: string) => f.find((p) => p.type === t)?.value ?? "00";
  return { dia: v("day"), mes: v("month"), anio: v("year"), hora: v("hour"), minuto: v("minute") };
}

/** La nota como viñeta con fecha y hora de RD, o null si queda vacía. */
export function lineaNota(texto: string, cuando: Date): string | null {
  const limpio = texto.replace(/\s+/g, " ").trim().slice(0, LIMITE_NOTA);
  if (!limpio) return null;
  const p = partesRD(cuando);
  return `- Kindle ${p.dia}/${p.mes} ${p.hora}:${p.minuto} · ${limpio}`;
}

/** Añade la línea al final; si ya está (un reintento), no la repite. */
export function agregarNota(notas: string | null, linea: string): string {
  const actual = (notas ?? "").replace(/\s+$/, "");
  if (actual.split(/\r?\n/).some((l) => l.trim() === linea)) return actual;
  return actual ? `${actual}\n${linea}` : linea;
}

export interface Trabajo {
  minutos: number;
  bloques: number;
  /** Inicio del último bloque sumado (al minuto). */
  ultimo: Date | null;
}

/** Lee la línea de resumen de trabajo, si existe. */
export function leerTrabajo(notas: string | null): Trabajo {
  for (const l of (notas ?? "").split(/\r?\n/)) {
    const m = l.trim().match(RE_TRABAJO);
    if (m) {
      const [, h, min, bloques, dd, mm, aaaa, hh, mi] = m;
      return {
        minutos: Number(h ?? 0) * 60 + Number(min ?? 0),
        bloques: Number(bloques),
        // Hora de RD → UTC (+4 h).
        ultimo: new Date(Date.UTC(Number(aaaa), Number(mm) - 1, Number(dd), Number(hh) + 4, Number(mi))),
      };
    }
  }
  return { minutos: 0, bloques: 0, ultimo: null };
}

function duracion(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function lineaTrabajo(t: Trabajo & { ultimo: Date }): string {
  const p = partesRD(t.ultimo);
  return `⏱ Trabajo en el Kindle: ${duracion(t.minutos)} en ${t.bloques} ${t.bloques === 1 ? "bloque" : "bloques"} · último ${p.dia}/${p.mes}/${p.anio} ${p.hora}:${p.minuto}`;
}

/**
 * Suma un bloque a la línea de resumen (o la crea al final). Los bloques van
 * en orden, así que uno que empezó a la misma hora o antes que el último ya
 * sumado es un reintento y se ignora (`sumado: false`).
 */
export function sumarBloque(notas: string | null, minutos: number, inicio: Date): { notas: string; sumado: boolean } {
  const actual = (notas ?? "").replace(/\s+$/, "");
  const inicioMin = new Date(Math.floor(inicio.getTime() / 60000) * 60000);
  const previo = leerTrabajo(actual);
  if (minutos < 1 || (previo.ultimo && inicioMin.getTime() <= previo.ultimo.getTime())) {
    return { notas: actual, sumado: false };
  }
  const nueva = lineaTrabajo({
    minutos: previo.minutos + Math.round(minutos),
    bloques: previo.bloques + 1,
    ultimo: inicioMin,
  });
  if (previo.ultimo) {
    const lineas = actual.split(/\r?\n/).map((l) => (RE_TRABAJO.test(l.trim()) ? nueva : l));
    return { notas: lineas.join("\n"), sumado: true };
  }
  return { notas: actual ? `${actual}\n${nueva}` : nueva, sumado: true };
}

/** Lo que el panel muestra de las notas: las últimas líneas y el trabajo acumulado. */
export function notasParaPanel(notas: string | null): { notas: string[]; trabajo_min: number } {
  const lineas = (notas ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !RE_TRABAJO.test(l))
    .map((l) => l.replace(/^[-•*✓]\s+/, "").replace(/\*\*([^*]+)\*\*/g, "$1"))
    .map((l) => (l.length > LARGO_LINEA_PANEL ? `${l.slice(0, LARGO_LINEA_PANEL - 1)}…` : l));
  return { notas: lineas.slice(-LINEAS_PANEL), trabajo_min: leerTrabajo(notas).minutos };
}
