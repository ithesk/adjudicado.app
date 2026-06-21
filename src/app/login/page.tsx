"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";
import { inputBase } from "@/components/ui";

export default function LoginPage() {
  const [modo, setModo] = useState<"entrar" | "crear">("entrar");
  const accion = modo === "entrar" ? signIn : signUp;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    accion,
    {},
  );

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-[22rem]">
        <div className="mb-7 flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-primary font-mono text-xs font-bold text-primary-ink shadow-raised">
            SK
          </span>
          <div className="leading-tight">
            <p className="font-mono text-sm font-semibold tracking-tight text-ink">
              ejecución<span className="text-muted">.sk</span>
            </p>
            <p className="text-[11px] text-muted">Centro de Ejecución</p>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface p-6 shadow-raised">
          <h1 className="font-display text-lg font-semibold text-ink">
            {modo === "entrar" ? "Entrar a tu cuenta" : "Crear una cuenta"}
          </h1>
          <p className="mt-1 mb-5 text-[13px] text-muted">
            Seguimiento de órdenes adjudicadas, de la OC al cobro.
          </p>

          <div className="mb-5 grid grid-cols-2 gap-1 rounded-md bg-surface-2 p-0.5 text-[13px] font-medium">
            <Tab activo={modo === "entrar"} onClick={() => setModo("entrar")}>
              Entrar
            </Tab>
            <Tab activo={modo === "crear"} onClick={() => setModo("crear")}>
              Crear cuenta
            </Tab>
          </div>

          <form action={formAction} className="space-y-3.5">
            {modo === "crear" && (
              <Campo
                label="Nombre"
                name="nombre"
                type="text"
                placeholder="Pablo Holguín"
                autoComplete="name"
              />
            )}
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
              placeholder="••••••••"
              autoComplete={
                modo === "entrar" ? "current-password" : "new-password"
              }
              required
            />

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
              {pending
                ? "Un momento…"
                : modo === "entrar"
                  ? "Entrar"
                  : "Crear cuenta"}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-[11px] text-muted">
          Innovación Tecnológica SK, SRL
        </p>
      </div>
    </main>
  );
}

function Tab({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[5px] py-1.5 transition-colors ${
        activo ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
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
