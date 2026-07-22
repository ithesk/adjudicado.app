"use client";

// EL patrón de mutación de la casa, escrito UNA vez. Sustituye a las copias
// locales de `correr()` que había en cada panel.
//
// Diferencias con las copias viejas:
// - Alcance POR ACCIÓN (clave): tocar un botón ya no deshabilita el panel
//   entero — solo lo que de verdad está ocupado. `ocupada(clave)` responde
//   por control; `alguna` queda para lo poco que sí es global.
// - Anti doble-clic de serie: la misma clave no corre dos veces a la vez.
// - El error SIEMPRE se ve: por defecto sale como aviso (toast); con
//   `errorInline: true` queda en `error` para pintarlo junto al form.
// - Un throw (red caída) no deja nada girando: se traduce a error legible.
//
// La convención de retorno de las actions no cambia: `string | null`.

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { avisoError } from "@/lib/avisos";

export type EstadoAccion = "idle" | "guardando" | "ok";

export function useAccion() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [ocupadas, setOcupadas] = useState<ReadonlySet<string>>(new Set());
  const [estado, setEstado] = useState<EstadoAccion>("idle");
  const [error, setError] = useState<string | null>(null);
  // Última acción confirmada — para el check junto al campo que se editó.
  const [okClave, setOkClave] = useState<string | null>(null);
  const timerOk = useRef<ReturnType<typeof setTimeout> | null>(null);

  function correr(
    clave: string,
    fn: () => Promise<string | null>,
    opts: { errorInline?: boolean } = {},
  ) {
    if (ocupadas.has(clave)) return; // anti doble-clic
    setError(null);
    setEstado("guardando");
    setOcupadas((prev) => new Set(prev).add(clave));
    startTransition(async () => {
      let err: string | null = null;
      try {
        err = await fn();
      } catch {
        err = "No se pudo completar — revisa tu conexión e inténtalo de nuevo.";
      }
      setOcupadas((prev) => {
        const s = new Set(prev);
        s.delete(clave);
        return s;
      });
      if (err) {
        setEstado("idle");
        if (opts.errorInline) setError(err);
        else avisoError(err);
      } else {
        setEstado("ok");
        setOkClave(clave);
        if (timerOk.current) clearTimeout(timerOk.current);
        timerOk.current = setTimeout(() => {
          setEstado("idle");
          setOkClave(null);
        }, 2000);
      }
      router.refresh();
    });
  }

  return {
    correr,
    /** ¿Esta acción concreta está corriendo? (para el disabled/spinner local) */
    ocupada: (clave: string) => ocupadas.has(clave),
    /** ¿Hay algo corriendo? (solo para indicadores globales, no para disabled) */
    alguna: ocupadas.size > 0,
    /** idle → guardando → ok (para IndicadorGuardado en la cabecera) */
    estado,
    /** Mensaje de error cuando se pidió errorInline */
    error,
    /** Clave de la última acción confirmada (check junto al campo, ~2 s) */
    okClave,
  };
}
