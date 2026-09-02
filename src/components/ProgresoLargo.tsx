"use client";

// Qué se enseña mientras una operación larga está en marcha.
//
// El problema que resuelve, en palabras del dueño: «hay un círculo que gira
// pero no sé cuánto le queda, si se quedó enganchado, si es un fallo, ni por
// dónde va». Un spinner pelado no responde a ninguna de esas preguntas.
//
// La regla aquí es no mentir. Solo se enseña lo que de verdad se sabe:
//
//  · El TIEMPO TRANSCURRIDO. Siempre se conoce y es lo que prueba que la cosa
//    sigue viva. Es la respuesta a «¿se quedó enganchado?».
//  · La FASE, cuando el cliente sabe de verdad en cuál está (por ejemplo:
//    subir el archivo es una petición, procesarlo es otra distinta). Nunca
//    fases inventadas que avanzan con un temporizador — eso es un decorado
//    que se queda clavado en el último paso y hace desconfiar de todo.
//  · Lo que SUELE tardar, para que el usuario pueda juzgar por sí mismo si
//    esto va normal.
//  · Un aviso explícito cuando se pasa del doble de lo normal. Eso responde a
//    «¿esto es un fallo?» sin fingir que sabemos si lo es.
//
// A propósito NO hay barra de porcentaje: no existe forma de conocer el
// avance real del trabajo del servidor, y una barra inventada es peor que
// ninguna — promete precisión que no hay.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export default function ProgresoLargo({
  fase,
  /** Milisegundos desde que arrancó (Date.now() al empezar). */
  desde,
  /** Cuánto suele tardar, en segundos. Sirve para avisar si se pasa. */
  estimado,
  className = "",
}: {
  fase: string;
  desde: number;
  estimado?: number;
  className?: string;
}) {
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const segundos = Math.max(0, Math.floor((ahora - desde) / 1000));
  const lento = estimado != null && segundos > estimado * 2;

  return (
    <span
      className={`inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] ${className}`}
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-1.5 text-ink-soft">
        <Loader2 className="h-3.5 w-3.5 flex-none motion-safe:animate-spin text-primary" strokeWidth={2.2} aria-hidden />
        {fase}
      </span>
      <span className="font-mono text-[11.5px] tabular-nums text-muted">
        {segundos < 60 ? `${segundos} s` : `${Math.floor(segundos / 60)} min ${segundos % 60} s`}
        {estimado != null && !lento && ` · suele tardar ~${estimado} s`}
      </span>
      {lento && (
        // No se afirma que haya fallado —no lo sabemos— pero sí que esto ya
        // no es lo normal, que es justo lo que el usuario necesita saber
        // para decidir si sigue esperando.
        <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-medium text-warn">
          Está tardando más de lo normal — sigue trabajando, no lo cierres
        </span>
      )}
    </span>
  );
}
