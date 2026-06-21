import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import OnboardingForm from "./OnboardingForm";

export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-primary">
            <svg width="16" height="16" viewBox="0 0 40 40" fill="none" aria-hidden>
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
          <span className="font-display text-base font-semibold tracking-tight">
            adjudicado<span className="text-muted">.app</span>
          </span>
        </div>
        <div className="mb-6 text-center">
          <h1 className="font-display text-xl font-semibold">
            Bienvenido. ¿Tu empresa o te unes a una?
          </h1>
          <p className="mt-1 text-sm text-muted">
            Crea el espacio de tu empresa, o únete al de un colega con su código.
          </p>
        </div>
        <OnboardingForm correo={user.email ?? ""} />
      </div>
    </main>
  );
}
