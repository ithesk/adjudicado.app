import { redirect } from "next/navigation";
import { getUser, getMiembro } from "@/lib/auth";
import BienvenidaForm from "./BienvenidaForm";

export const dynamic = "force-dynamic";

export default async function BienvenidaPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const miembro = await getMiembro();

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-[22rem]">
        <div className="mb-7 flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-primary shadow-raised">
            <svg width="18" height="18" viewBox="0 0 40 40" fill="none" aria-hidden>
              <path
                d="M12 20.5 L17.5 26 L28.5 14"
                stroke="currentColor"
                className="text-primary-ink"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <p className="font-display text-lg font-semibold tracking-tight text-ink">
            adjudicado<span className="text-muted">.app</span>
          </p>
        </div>

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
