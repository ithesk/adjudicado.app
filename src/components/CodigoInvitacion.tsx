"use client";

import { useState } from "react";

export default function CodigoInvitacion({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // ignorar
    }
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <code className="flex-1 overflow-x-auto rounded-md bg-surface-2 px-3 py-2 font-mono text-xs text-ink">
        {codigo}
      </code>
      <button
        type="button"
        onClick={copiar}
        className="shrink-0 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-ink transition hover:bg-primary-hover"
      >
        {copiado ? "¡Copiado!" : "Copiar"}
      </button>
    </div>
  );
}
