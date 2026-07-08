"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { registrar, type RegistroState } from "./actions";
import { inputBase, btnPrimary } from "@/components/ui";
import { PLANES, precioLegible, type PlanId } from "@/lib/planes";

export default function RegistroForm({ planInicial }: { planInicial: PlanId }) {
  const [plan, setPlan] = useState<PlanId>(planInicial);
  const [state, formAction, pending] = useActionState<RegistroState, FormData>(
    registrar,
    {},
  );
  const elegido = PLANES.find((p) => p.id === plan) ?? PLANES[0];

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="plan" value={plan} />

      {/* Selector de plan */}
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-ink-soft">
          Plan
        </legend>
        <div className="grid grid-cols-3 gap-1.5">
          {PLANES.map((p) => {
            const activo = p.id === plan;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlan(p.id)}
                aria-pressed={activo}
                className={`rounded-lg border px-2 py-2 text-left transition-colors ${
                  activo
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-line bg-surface hover:border-line-strong"
                }`}
              >
                <span className="block text-[13px] font-semibold text-ink">
                  {p.nombre}
                </span>
                <span className="block font-mono text-[11px] text-muted">
                  {precioLegible(p)}
                  {p.precioMensual !== null && "/mes"}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[12px] text-muted">{elegido.resumen}</p>
      </fieldset>

      <Campo
        label="Tu nombre"
        name="nombre"
        type="text"
        placeholder="Pablo Holguín"
        autoComplete="name"
        required
      />
      <Campo
        label="Nombre de tu empresa"
        name="empresa"
        type="text"
        placeholder="Mi Empresa, SRL"
        required
      />
      <Campo
        label="Correo"
        name="email"
        type="email"
        placeholder="tu@correo.com"
        autoComplete="email"
        required
      />
      <Campo
        label="Contraseña"
        name="password"
        type="password"
        placeholder="Mínimo 6 caracteres"
        autoComplete="new-password"
        required
      />

      {state.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className={btnPrimary("w-full py-2.5")}>
        {pending ? "Creando tu cuenta…" : "Crear cuenta y empezar"}
      </button>

      <p className="text-center text-[12px] text-muted">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}

function Campo({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">
        {label}
      </span>
      <input {...props} className={inputBase} />
    </label>
  );
}
