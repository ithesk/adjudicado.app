"use client";

import { useState, useTransition } from "react";
import { Wifi, Check, AlertCircle, Loader2 } from "lucide-react";
import { probarOdoo } from "@/lib/actions/odoo";

export default function ProbarOdooBtn() {
  const [pending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{
    ok: boolean;
    version?: string;
    error?: string;
  } | null>(null);

  function probar() {
    setResultado(null);
    startTransition(async () => {
      const res = await probarOdoo();
      setResultado(res);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={probar}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink disabled:opacity-55"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} aria-hidden />
        ) : (
          <Wifi className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        )}
        {pending ? "Conectando…" : "Probar conexión"}
      </button>

      {resultado && (
        resultado.ok ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-ok">
            <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
            Conexión correcta
            {resultado.version && (
              <span className="text-muted">· Odoo {resultado.version}</span>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            {resultado.error ?? "Error desconocido"}
          </span>
        )
      )}
    </div>
  );
}
