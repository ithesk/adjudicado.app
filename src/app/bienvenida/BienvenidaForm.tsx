"use client";

import { useActionState } from "react";
import { establecerClave, type ClaveState } from "./actions";
import { inputBase } from "@/components/ui";

export default function BienvenidaForm() {
  const [state, formAction, pending] = useActionState<ClaveState, FormData>(
    establecerClave,
    {},
  );

  return (
    <form action={formAction} className="space-y-3.5">
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">
          Crea tu contraseña
        </span>
        <input
          type="password"
          name="password"
          placeholder="••••••••"
          autoComplete="new-password"
          required
          className={inputBase}
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">
          Repite la contraseña
        </span>
        <input
          type="password"
          name="confirm"
          placeholder="••••••••"
          autoComplete="new-password"
          required
          className={inputBase}
        />
      </label>

      {state.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-ink shadow-card transition-colors hover:bg-primary-hover disabled:opacity-55"
      >
        {pending ? "Guardando…" : "Entrar al tablero"}
      </button>
    </form>
  );
}
