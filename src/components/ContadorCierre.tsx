"use client";

// Contador regresivo hasta el cierre de un proceso: cuánto falta de verdad
// (días, horas, minutos y segundos), no solo «Mañana». Una oferta que llega a
// las 09:01 de un cierre de las 09:00 no existe, así que el último día
// importa la hora exacta.
//
// El semáforo va por horas reales: rojo en las últimas 24 h, ámbar hasta 72 h.
// Antes de montarse en el navegador enseña la fecha y hora fijas, para que el
// HTML del servidor y el del cliente coincidan.

import { useSyncExternalStore } from "react";
import { Timer } from "lucide-react";
import { urgenciaChip } from "@/lib/ui";
import {
  cierreCortoRd,
  instanteCierre,
  nivelCierre,
  restante,
  textoRestante,
} from "@/lib/licitaciones/hora-rd";

// Un reloj compartido por cadencia: veinte filas de la lista son UN solo
// temporizador, no veinte. En el servidor no hay hora (null).
function crearReloj(cadenciaMs: number) {
  let ahora = Date.now();
  const oyentes = new Set<() => void>();
  let t: ReturnType<typeof setInterval> | null = null;
  return {
    subscribe(oyente: () => void) {
      oyentes.add(oyente);
      if (!t) {
        ahora = Date.now();
        t = setInterval(() => {
          ahora = Date.now();
          oyentes.forEach((o) => o());
        }, cadenciaMs);
      }
      return () => {
        oyentes.delete(oyente);
        if (oyentes.size === 0 && t) {
          clearInterval(t);
          t = null;
        }
      };
    },
    leer: () => ahora,
    enServidor: () => null,
  };
}

// En la ficha, por segundo; en la lista basta cada 30 s.
const RELOJ_SEGUNDO = crearReloj(1000);
const RELOJ_LISTA = crearReloj(30_000);

export default function ContadorCierre({
  cierre,
  /** Sin segundos y más pequeño: para filas de lista. */
  compacto = false,
  className = "",
}: {
  cierre: string | null;
  compacto?: boolean;
  className?: string;
}) {
  const objetivo = instanteCierre(cierre);
  const reloj = compacto ? RELOJ_LISTA : RELOJ_SEGUNDO;
  const ahora = useSyncExternalStore<number | null>(reloj.subscribe, reloj.leer, reloj.enServidor);

  if (objetivo === null) {
    return <span className={`rounded px-1.5 py-0.5 font-mono text-xs ${urgenciaChip("neutro")} ${className}`}>Sin plazo</span>;
  }

  const fijo = `cierra ${cierreCortoRd(cierre)}`;
  const r = ahora === null ? null : restante(objetivo, ahora);
  const texto = r ? textoRestante(r, !compacto) : fijo;
  const nivel = r ? nivelCierre(r) : "neutro";

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded font-mono tabular-nums ${urgenciaChip(nivel)} ${
        compacto ? "px-1.5 py-0.5 text-xs font-medium" : "px-2 py-1 text-[13px] font-semibold"
      } ${className}`}
      title={`Cierre: ${cierreCortoRd(cierre)} (hora de RD)`}
      // Un lector de pantalla no necesita oír cada segundo.
      aria-live="off"
    >
      {!compacto && <Timer className="h-3.5 w-3.5 flex-none" strokeWidth={2.2} aria-hidden />}
      {r && r.ms > 0 && !compacto && <span className="font-sans font-normal opacity-80">faltan</span>}
      {texto}
    </span>
  );
}
