// El turnero que hay detrás de useAccion, sin React para poder probarlo.
//
// Una clave = una acción en curso como máximo. Lo que pasa con la segunda
// llamada NO es un detalle: descartarla es lo correcto para un botón (dos
// clics = una línea, no dos) y es pérdida de datos para un autosave, donde
// cada llamada trae un campo distinto. De ahí las dos vías.

export class TurnoPorClave<T> {
  private enCurso = new Set<string>();
  private colas = new Map<string, T[]>();

  /**
   * Pide turno para `clave`.
   * - "correr": estaba libre y queda ocupada — arranca ya.
   * - "encolada": ocupada y `encolar` — espera su turno (FIFO).
   * - "descartada": ocupada sin `encolar` — anti doble-clic.
   */
  pedir(clave: string, tarea: T, encolar: boolean): "correr" | "encolada" | "descartada" {
    if (!this.enCurso.has(clave)) {
      this.enCurso.add(clave);
      return "correr";
    }
    if (!encolar) return "descartada";
    const cola = this.colas.get(clave);
    if (cola) cola.push(tarea);
    else this.colas.set(clave, [tarea]);
    return "encolada";
  }

  /**
   * Terminó la que corría. Devuelve la siguiente de la cola —la clave SIGUE
   * ocupada, así el indicador no parpadea entre campo y campo— o null, y
   * entonces la libera.
   */
  siguiente(clave: string): T | null {
    const cola = this.colas.get(clave);
    const proxima = cola?.shift();
    if (cola && cola.length === 0) this.colas.delete(clave);
    if (proxima !== undefined) return proxima;
    this.enCurso.delete(clave);
    return null;
  }

  /** Copia de las claves ocupadas (para el disabled/spinner de cada control). */
  ocupadas(): Set<string> {
    return new Set(this.enCurso);
  }
}
