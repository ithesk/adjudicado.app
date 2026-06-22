"use client";

import { useState, useTransition } from "react";
import { RotateCw, X, Check } from "lucide-react";
import { reenviarInvitacion, cancelarInvitacion } from "./actions";

export default function BotonesInvitacion({
  email,
  id,
}: {
  email: string;
  id: string;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);

  function reenviar() {
    setMsg(null);
    startTransition(async () => {
      const r = await reenviarInvitacion(email, "colaborador");
      setMsg(r);
      setTimeout(() => setMsg(null), 4000);
    });
  }

  function cancelar() {
    startTransition(async () => {
      await cancelarInvitacion(id);
    });
  }

  return (
    <div className="flex items-center gap-2">
      {msg?.ok && (
        <span className="inline-flex items-center gap-1 text-[12px] text-ok">
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          {msg.ok}
        </span>
      )}
      {msg?.error && (
        <span className="text-[12px] text-danger">{msg.error}</span>
      )}
      <button
        type="button"
        onClick={reenviar}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink disabled:opacity-55"
      >
        <RotateCw
          className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`}
          strokeWidth={2}
          aria-hidden
        />
        {pending ? "Enviando…" : "Reenviar"}
      </button>
      <button
        type="button"
        onClick={cancelar}
        disabled={pending}
        className="grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-55"
        title="Cancelar invitación"
        aria-label="Cancelar invitación"
      >
        <X className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
