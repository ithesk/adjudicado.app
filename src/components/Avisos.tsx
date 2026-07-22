"use client";

// La pila de avisos (toasts). Montada UNA vez en el layout de la app.
// Verde se va solo (2.5 s); rojo se queda más (7 s) y siempre se puede
// cerrar con un clic — un error nunca debe desaparecer antes de leerse.

import { useEffect, useState } from "react";
import { AlertCircle, Check, X } from "lucide-react";
import { escucharAvisos, type Aviso } from "@/lib/avisos";

export default function Avisos() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  useEffect(() => {
    return escucharAvisos((a) => {
      setAvisos((prev) => [...prev.slice(-3), a]); // nunca más de 4 a la vez
      const vida = a.tipo === "ok" ? 2500 : 7000;
      setTimeout(() => setAvisos((prev) => prev.filter((x) => x.id !== a.id)), vida);
    });
  }, []);

  if (avisos.length === 0) return null;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4"
    >
      {avisos.map((a) => (
        <div
          key={a.id}
          className={`pointer-events-auto flex w-fit max-w-full items-start gap-2 rounded-lg border px-3 py-2 text-[13px] shadow-raised animate-fade-in ${
            a.tipo === "ok"
              ? "border-line bg-surface text-ink"
              : "border-danger/30 bg-danger-soft text-danger"
          }`}
        >
          {a.tipo === "ok" ? (
            <Check className="mt-0.5 h-3.5 w-3.5 flex-none text-ok" strokeWidth={2.4} aria-hidden />
          ) : (
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-none" strokeWidth={2.2} aria-hidden />
          )}
          <span className="min-w-0 break-words">{a.texto}</span>
          <button
            type="button"
            onClick={() => setAvisos((prev) => prev.filter((x) => x.id !== a.id))}
            className="ml-1 flex-none rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
            aria-label="Cerrar aviso"
          >
            <X className="h-3 w-3" strokeWidth={2.4} />
          </button>
        </div>
      ))}
    </div>
  );
}
