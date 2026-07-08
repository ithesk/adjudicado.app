"use client";

import Link from "next/link";
import { useActionState } from "react";
import { autenticar, type AuthState } from "./actions";
import { inputBase } from "@/components/ui";
import { LogoLockup } from "@/components/Logo";
import { BandaPuntos, Resalte, btnAzul, btnNav } from "@/components/landing-ui";

// Formulario compartido de /login y /registro, en la misma línea visual de la
// landing. El modo lo fija la ruta, así la URL y el <title> siempre
// corresponden a lo que se muestra.
export default function AuthForm({ modo }: { modo: "entrar" | "crear" }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    autenticar,
    {},
  );
  const entrar = modo === "entrar";

  return (
    <div className="flex min-h-screen flex-col bg-surface text-ink">
      <header>
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5">
          <Link href="/" aria-label="adjudicado.app">
            <LogoLockup markSize={24} textClass="text-base" />
          </Link>
          <Link href={entrar ? "/registro" : "/login"} className={btnNav}>
            {entrar ? "Crear cuenta" : "Entrar"}
          </Link>
        </div>
      </header>

      <main className="grid flex-1 place-items-center px-4 py-12">
        <div className="w-full max-w-[24rem]">
          <div className="text-center">
            <h1 className="font-display text-[1.7rem] leading-snug font-bold tracking-[-0.01em] text-ink">
              {entrar ? (
                <>
                  Entra a <Resalte>tu cuenta</Resalte>
                </>
              ) : (
                <>
                  Crea la cuenta de <Resalte>tu empresa</Resalte>
                </>
              )}
            </h1>
            <p className="mt-2 text-[13px] text-muted">
              {entrar
                ? "Seguimiento de licitaciones, de la OC al cobro."
                : "Crea el espacio de tu empresa y trabaja en equipo."}
            </p>
          </div>

          <form
            action={formAction}
            className="mt-8 space-y-3.5 rounded-lg border border-line bg-surface p-6 shadow-raised"
          >
            <input type="hidden" name="modo" value={modo} />
            {!entrar && (
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
              autoComplete={entrar ? "current-password" : "new-password"}
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
              className={`${btnAzul} mt-1 w-full disabled:opacity-55`}
            >
              {pending ? "Un momento…" : entrar ? "Entrar" : "Crear cuenta"}
            </button>
          </form>

          <p className="mt-5 text-center text-[13px] text-muted">
            {entrar ? "¿Primera vez aquí? " : "¿Ya tienes cuenta? "}
            <Link
              href={entrar ? "/registro" : "/login"}
              className="font-semibold text-primary hover:underline"
            >
              {entrar ? "Crea la cuenta de tu empresa" : "Entra"}
            </Link>
          </p>

          <p className="mt-8 text-center text-[11px] text-muted">
            Para empresas que ejecutan contratos del Estado dominicano.
          </p>
        </div>
      </main>

      <BandaPuntos filas={3} />
    </div>
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
