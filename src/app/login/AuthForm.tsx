"use client";

import Link from "next/link";
import { useActionState } from "react";
import { autenticar, type AuthState } from "./actions";
import { inputBase } from "@/components/ui";
import { LogoLockup } from "@/components/Logo";

// Formulario compartido de /login y /registro: mismos campos y server action.
// El modo lo fija la ruta (las pestañas navegan entre ambas páginas), así la
// URL y el <title> siempre corresponden a lo que se muestra.
export default function AuthForm({ modo }: { modo: "entrar" | "crear" }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    autenticar,
    {},
  );

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-[22rem]">
        <Link href="/" className="inline-block">
          <LogoLockup className="mb-7" markSize={30} />
        </Link>

        <div className="rounded-lg border border-line bg-surface p-6 shadow-raised">
          <h1 className="font-display text-lg font-semibold text-ink">
            {modo === "entrar" ? "Entra a tu cuenta" : "Crea la cuenta de tu empresa"}
          </h1>
          <p className="mt-1 mb-5 text-[13px] text-muted">
            {modo === "entrar"
              ? "Seguimiento de licitaciones, de la OC al cobro."
              : "Crea el espacio de tu empresa y trabaja en equipo."}
          </p>

          <div className="mb-5 grid grid-cols-2 gap-1 rounded-md bg-surface-2 p-0.5 text-[13px] font-medium">
            <Tab href="/login" activo={modo === "entrar"}>
              Entrar
            </Tab>
            <Tab href="/registro" activo={modo === "crear"}>
              Crear cuenta
            </Tab>
          </div>

          <form action={formAction} className="space-y-3.5">
            <input type="hidden" name="modo" value={modo} />
            {modo === "crear" && (
              <>
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
              </>
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
          Para empresas que ejecutan contratos del Estado dominicano.
        </p>
      </div>
    </main>
  );
}

function Tab({
  href,
  activo,
  children,
}: {
  href: string;
  activo: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-[5px] py-1.5 text-center transition-colors ${
        activo ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"
      }`}
    >
      {children}
    </Link>
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
