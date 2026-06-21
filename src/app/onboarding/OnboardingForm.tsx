"use client";

import { useActionState, useState } from "react";
import {
  crearOrganizacion,
  unirseOrganizacion,
  type OnbState,
} from "./actions";

export default function OnboardingForm({ correo }: { correo: string }) {
  const [modo, setModo] = useState<"crear" | "unir">("crear");
  const accion = modo === "crear" ? crearOrganizacion : unirseOrganizacion;
  const [state, formAction, pending] = useActionState<OnbState, FormData>(
    accion,
    {},
  );

  return (
    <div className="rounded-md border border-line bg-surface p-6 shadow-sm">
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-md bg-surface-2 p-1 text-sm font-medium">
        <button
          type="button"
          onClick={() => setModo("crear")}
          className={`rounded-md py-1.5 transition ${
            modo === "crear" ? "bg-surface shadow-sm" : "text-muted"
          }`}
        >
          Crear mi empresa
        </button>
        <button
          type="button"
          onClick={() => setModo("unir")}
          className={`rounded-md py-1.5 transition ${
            modo === "unir" ? "bg-surface shadow-sm" : "text-muted"
          }`}
        >
          Unirme
        </button>
      </div>

      <form action={formAction} className="space-y-3">
        <Campo
          label="Tu nombre"
          name="mi_nombre"
          placeholder={correo}
          autoComplete="name"
        />

        {modo === "crear" ? (
          <Campo
            label="Nombre de tu empresa"
            name="nombre"
            placeholder="Mi Empresa, SRL"
            required
          />
        ) : (
          <Campo
            label="Código de invitación"
            name="codigo"
            placeholder="00000000-0000-0000-0000-000000000000"
            required
          />
        )}

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
          {pending
            ? "Un momento…"
            : modo === "crear"
              ? "Crear mi empresa"
              : "Unirme a la empresa"}
        </button>
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
      <span className="mb-1 block text-sm font-medium text-ink">
        {label}
      </span>
      <input
        {...props}
        className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}
