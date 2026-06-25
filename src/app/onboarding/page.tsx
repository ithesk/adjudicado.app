import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import OnboardingForm from "./OnboardingForm";
import { LogoLockup } from "@/components/Logo";

export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <LogoLockup markSize={28} textClass="text-base" />
        </div>
        <div className="mb-6 text-center">
          <h1 className="font-display text-xl font-semibold">
            Crea el espacio de tu empresa
          </h1>
          <p className="mt-1 text-sm text-muted">
            Quedas como administrador. Luego invitas a tu equipo por correo.
          </p>
        </div>
        <OnboardingForm correo={user.email ?? ""} />
      </div>
    </main>
  );
}
