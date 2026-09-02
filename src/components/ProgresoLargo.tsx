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
// Sobre la BARRA: hay dos, y la diferencia es la honestidad.
//  · Si se pasa `porcentaje`, la barra lo pinta. Solo se usa donde el avance
//    es un hecho medible: los bytes enviados de una subida.
//  · Si no, la barra es INDETERMINADA: se desplaza para decir «sigo viva»
//    sin afirmar cuánto falta. Nunca se inventa un número — una barra que
//    promete precisión que no existe se queda clavada en el 90 % y acaba
//    haciendo desconfiar de todo lo demás.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export default function ProgresoLargo({
  fase,
  /** Milisegundos desde que arrancó (Date.now() al empezar). */
  desde,
  /** Cuánto suele tardar, en segundos. Sirve para avisar si se pasa. */
  estimado,
  /** Avance REAL 0-100. Solo donde es un hecho (bytes subidos). Si falta,
   *  la barra va indeterminada — que es lo honesto. */
  porcentaje,
  className = "",
}: {
  fase: string;
  desde: number;
  estimado?: number;
  porcentaje?: number | null;
  className?: string;
}) {
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const segundos = Math.max(0, Math.floor((ahora - desde) / 1000));
  const lento = estimado != null && segundos > estimado * 2;

  const conPorcentaje = typeof porcentaje === "number" && porcentaje >= 0;
  const pct = conPorcentaje ? Math.min(100, Math.max(0, Math.round(porcentaje))) : null;

  return (
    <span className={`flex min-w-0 flex-col gap-1 text-[12.5px] ${className}`} aria-live="polite">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-ink-soft">
          <Loader2
            className="h-3.5 w-3.5 flex-none motion-safe:animate-spin text-primary"
            strokeWidth={2.2}
            aria-hidden
          />
          <span className="min-w-0 truncate">{fase}</span>
        </span>
        <span className="font-mono text-[11.5px] tabular-nums text-muted">
          {pct != null && `${pct}% · `}
          {segundos < 60 ? `${segundos} s` : `${Math.floor(segundos / 60)} min ${segundos % 60} s`}
          {estimado != null && !lento && ` · suele tardar ~${estimado} s`}
        </span>
      </span>

      {/* La barra. Con porcentaje real pinta ese ancho; sin él se desplaza
          sin afirmar cuánto falta. Los role/aria cambian igual, para que un
          lector de pantalla tampoco reciba un número inventado. */}
      <span
        className="block h-1 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={pct ?? undefined}
        aria-valuemin={pct != null ? 0 : undefined}
        aria-valuemax={pct != null ? 100 : undefined}
        aria-label={fase}
      >
        {pct != null ? (
          <span
            className="block h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        ) : (
          <span className="block h-full w-1/4 rounded-full bg-primary animate-barra-indeterminada" />
        )}
      </span>

      {lento && (
        // No se afirma que haya fallado —no lo sabemos— pero sí que esto ya
        // no es lo normal, que es justo lo que el usuario necesita saber
        // para decidir si sigue esperando.
        <span className="w-fit rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-medium text-warn">
          Está tardando más de lo normal — sigue trabajando, no lo cierres
        </span>
      )}
    </span>
  );
}
