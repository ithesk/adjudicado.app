import { redirect } from "next/navigation";
import { getUser, getMiembro } from "@/lib/auth";
import BienvenidaForm from "./BienvenidaForm";
import { LogoLockup } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function BienvenidaPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const miembro = await getMiembro();

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-[22rem]">
        <LogoLockup className="mb-7" markSize={30} />

        <div className="rounded-lg border border-line bg-surface p-6 shadow-raised">
          <h1 className="font-display text-lg font-semibold text-ink">
            ¡Bienvenido{miembro?.organizacion?.nombre
              ? ` a ${miembro.organizacion.nombre.split(",")[0]}`
              : ""}!
          </h1>
          <p className="mt-1 mb-5 text-[13px] text-muted">
            Ya eres parte del equipo. Crea una contraseña para entrar cuando
            quieras.
          </p>
          <BienvenidaForm />
        </div>
      </div>
    </main>
  );
}
