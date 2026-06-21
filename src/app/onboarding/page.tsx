import { redirect } from "next/navigation";
import { getMiembro, getUser } from "@/lib/auth";
import OnboardingForm from "./OnboardingForm";

export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const miembro = await getMiembro();
  if (miembro) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="font-display text-xl font-semibold">
            Configura tu organización
          </h1>
          <p className="mt-1 text-sm text-muted">
            Crea una nueva o únete a una existente con el código de invitación.
          </p>
        </div>
        <OnboardingForm correo={user.email ?? ""} />
      </div>
    </main>
  );
}
