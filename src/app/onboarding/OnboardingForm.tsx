"use client";

import { useActionState } from "react";
import { crearOrganizacion, type OnbState } from "./actions";

export default function OnboardingForm({ correo }: { correo: string }) {
  const [state, formAction, pending] = useActionState<OnbState, FormData>(
    crearOrganizacion,
    {},
  );

  return (
    <div className="rounded-md border border-line bg-surface p-6 shadow-sm">
      <form action={formAction} className="space-y-3">
        <Campo
          label="Tu nombre"
          name="mi_nombre"
          placeholder={correo}
          autoComplete="name"
        />
        <Campo
          label="Nombre de tu empresa"
          name="nombre"
          placeholder="Mi Empresa, SRL"
          required
        />

        {state.error && (
          <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-ink transition hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "Un momento…" : "Crear mi empresa"}
        </button>

        <p className="pt-1 text-center text-[12px] text-muted">
          ¿Te invitaron a una empresa? Usa el enlace que te llegó por correo.
        </p>
      </form>
    </div>
  );
}

function Campo({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      <input
        {...props}
        className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}
