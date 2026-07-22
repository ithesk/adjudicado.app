"use client";

// Bus mínimo de avisos (toasts) — sin librerías, regla de la casa.
// Cualquier módulo cliente puede avisar; <Avisos/> (montado una vez en el
// layout) es el único oyente y los pinta. Sirve para dos cosas que el
// feedback inline no cubre: confirmar acciones cuyo resultado no queda a la
// vista, y errores de acciones OPTIMISTAS (la UI ya cambió; si el servidor
// falla, el aviso es el único canal honesto).

export type Aviso = { id: number; tipo: "ok" | "error"; texto: string };

let oyente: ((a: Aviso) => void) | null = null;
let n = 0;

export function escucharAvisos(fn: (a: Aviso) => void): () => void {
  oyente = fn;
  return () => {
    if (oyente === fn) oyente = null;
  };
}

export function avisoOk(texto: string): void {
  oyente?.({ id: ++n, tipo: "ok", texto });
}

export function avisoError(texto: string): void {
  oyente?.({ id: ++n, tipo: "error", texto });
}
