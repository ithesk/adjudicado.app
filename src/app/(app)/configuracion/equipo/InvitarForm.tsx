"use client";

import { useActionState } from "react";
import { Mail } from "lucide-react";
import { invitarMiembro, type InviteState } from "./actions";
import { inputBase } from "@/components/ui";

export default function InvitarForm() {
  const [state, formAction, pending] = useActionState<InviteState, FormData>(
    invitarMiembro,
    {},
  );

  return (
    <form action={formAction} className="space-y-2.5">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          name="email"
          placeholder="correo@empresa.com"
          required
          className={`${inputBase} flex-1`}
        />
        <select
          name="rol"
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary"
        >
          <option value="colaborador">Colaborador</option>
          <option value="admin">Administrador</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-ink transition-colors hover:bg-primary-hover disabled:opacity-55"
        >
          <Mail className="h-4 w-4" strokeWidth={2} aria-hidden />
          {pending ? "Enviando…" : "Invitar"}
        </button>
      </div>
      {state.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-md bg-ok-soft px-3 py-2 text-[13px] text-ok">
          {state.ok}
        </p>
      )}
    </form>
  );
}
