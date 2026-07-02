"use client";

import { useState } from "react";
import { Copy, Check, Mail } from "lucide-react";

interface BuzonOrdenProps {
  buzon: string | null;
  dominio: string | null;
}

export default function BuzonOrden({ buzon, dominio }: BuzonOrdenProps) {
  const [copiado, setCopiado] = useState(false);

  // Sin dominio configurado no podemos mostrar la dirección completa.
  if (!dominio) {
    return (
      <p className="text-[12px] text-muted">
        Configura el correo entrante en{" "}
        <span className="font-medium text-ink-soft">Integraciones</span> para
        activar esta función.
      </p>
    );
  }

  // Sin buzón la orden aún no tiene código asignado.
  if (!buzon) {
    return (
      <p className="text-[12px] text-muted">
        Esta orden no tiene buzón asignado.
      </p>
    );
  }

  const direccion = `oc-${buzon}@${dominio}`;

  function copiar() {
    navigator.clipboard.writeText(direccion).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  return (
    <div className="space-y-1.5">
      {/* Dirección + botón copiar */}
      <div className="flex items-center gap-2">
        <Mail className="h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={2} aria-hidden />
        <span className="min-w-0 flex-1 break-all font-mono text-[12px] text-ink">
          {direccion}
        </span>
        <button
          type="button"
          onClick={copiar}
          title="Copiar dirección"
          aria-label="Copiar dirección de correo"
          className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          {copiado ? (
            <Check className="h-3.5 w-3.5 text-ok" strokeWidth={2.5} aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          )}
        </button>
      </div>

      {/* Texto explicativo */}
      <p className="text-[11px] text-muted">
        Reenvía correos a esta dirección y quedan en la bitácora.
      </p>
    </div>
  );
}
