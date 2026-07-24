"use client";

// EL patrón de mutación de la casa, escrito UNA vez. Sustituye a las copias
// locales de `correr()` que había en cada panel.
//
// Diferencias con las copias viejas:
// - Alcance POR ACCIÓN (clave): tocar un botón ya no deshabilita el panel
//   entero — solo lo que de verdad está ocupado. `ocupada(clave)` responde
//   por control; `alguna` queda para lo poco que sí es global.
// - Anti doble-clic de serie: la misma clave no corre dos veces a la vez.
//   OJO: descartar la segunda llamada es correcto para un BOTÓN (dos clics =
//   una sola línea creada) y es PÉRDIDA DE DATOS para un autosave, donde cada
//   llamada trae un campo distinto. Rellenar el perfil de la empresa a golpe
//   de Tab disparaba un guardado por campo con la MISMA clave: el primero
//   corría y los demás se descartaban en silencio — el texto seguía en
//   pantalla (los inputs son no controlados) y solo al recargar se veía que
//   no estaba. Por eso existe `encolar`: en vez de tirar la llamada, la pone
//   en una cola FIFO por clave y la corre cuando termina la anterior.
// - El error SIEMPRE se ve: por defecto sale como aviso (toast); con
//   `errorInline: true` queda en `error` para pintarlo junto al form.
// - Un throw (red caída) no deja nada girando: se traduce a error legible.
//
// La convención de retorno de las actions no cambia: `string | null`.

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { avisoError } from "@/lib/avisos";
import { TurnoPorClave } from "@/lib/cola-acciones";

export type EstadoAccion = "idle" | "guardando" | "ok";

type OpcionesAccion = {
  errorInline?: boolean;
  /** No recargar la página al terminar — para autosave OPTIMISTA de
   *  celdas (la UI ya muestra el valor; recargar todo por una celda es
   *  lo que hacía lento el cotizador con 18 líneas). */
  sinRefresh?: boolean;
  /** Se llama al terminar con el error (o null): para revertir el
   *  estado optimista si el servidor falló. */
  alTerminar?: (err: string | null) => void;
  /** Autosave: si la clave está ocupada, ESPERA su turno en vez de
   *  descartarse. Obligatorio cuando varias llamadas comparten clave y cada
   *  una trae datos distintos (un campo por llamada). */
  encolar?: boolean;
};

type Turno = { fn: () => Promise<string | null>; opts: OpcionesAccion };

export function useAccion() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [ocupadas, setOcupadas] = useState<ReadonlySet<string>>(new Set());
  const [estado, setEstado] = useState<EstadoAccion>("idle");
  const [error, setError] = useState<string | null>(null);
  // Última acción confirmada — para el check junto al campo que se editó.
  const [okClave, setOkClave] = useState<string | null>(null);
  const timerOk = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Quién corre AHORA y quién espera. Va en ref, no en estado: dos blur
  // seguidos (Tab, Tab) ocurren antes de que React vuelva a renderizar, y con
  // el estado el segundo veía la clave libre. La lógica vive aparte y está
  // probada en cola-acciones.test.ts.
  const turnos = useRef(new TurnoPorClave<Turno>());

  function correr(
    clave: string,
    fn: () => Promise<string | null>,
    opts: OpcionesAccion = {},
  ) {
    if (turnos.current.pedir(clave, { fn, opts }, opts.encolar === true) === "correr") {
      lanzar(clave, fn, opts);
    }
  }

  function lanzar(clave: string, fn: () => Promise<string | null>, opts: OpcionesAccion) {
    setOcupadas(turnos.current.ocupadas());
    setError(null);
    setEstado("guardando");
    startTransition(async () => {
      let err: string | null = null;
      try {
        err = await fn();
      } catch {
        err = "No se pudo completar — revisa tu conexión e inténtalo de nuevo.";
      }
      if (err) {
        setEstado("idle");
        if (opts.errorInline) setError(err);
        else avisoError(err);
      }
      opts.alTerminar?.(err);

      // ¿Alguien esperaba turno en esta clave? Corre ahora, sin soltarla (así
      // el indicador sigue en "guardando" y el refresh se hace una sola vez,
      // al final de la tanda).
      const siguiente = turnos.current.siguiente(clave);
      if (siguiente) {
        lanzar(clave, siguiente.fn, siguiente.opts);
        return;
      }

      setOcupadas(turnos.current.ocupadas());
      if (!err) {
        setEstado("ok");
        setOkClave(clave);
        if (timerOk.current) clearTimeout(timerOk.current);
        timerOk.current = setTimeout(() => {
          setEstado("idle");
          setOkClave(null);
        }, 2000);
      }
      if (!opts.sinRefresh) router.refresh();
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
