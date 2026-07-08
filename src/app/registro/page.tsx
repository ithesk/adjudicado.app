import Link from "next/link";
import type { Metadata } from "next";
import { LogoLockup } from "@/components/Logo";
import { DIAS_PRUEBA, PLAN_POR_DEFECTO, esPlanValido } from "@/lib/planes";
import RegistroForm from "./RegistroForm";

export const metadata: Metadata = {
  title: "Crear cuenta — adjudicado.app",
  description: "Crea la cuenta de tu empresa y empieza a dar seguimiento a tus adjudicaciones.",
};

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan } = await searchParams;
  const planInicial = esPlanValido(plan) ? plan : PLAN_POR_DEFECTO;

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-[24rem]">
        <Link href="/" className="mb-7 inline-flex">
          <LogoLockup markSize={30} />
        </Link>

        <div className="rounded-lg border border-line bg-surface p-6 shadow-raised">
          <h1 className="font-display text-lg font-semibold text-ink">
            Crea la cuenta de tu empresa
          </h1>
          <p className="mt-1 mb-5 text-[13px] text-muted">
            {DIAS_PRUEBA} días de prueba. Sin tarjeta para empezar.
          </p>

          <RegistroForm planInicial={planInicial} />
        </div>

        <p className="mt-5 text-center text-[11px] text-muted">
          Para empresas que ejecutan contratos del Estado dominicano.
        </p>
      </div>
    </main>
  );
}
