import { type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORG_COOKIE } from "@/lib/auth";

// Link del correo (invitación / magic link): verifica el token (esto crea la
// sesión y deja las cookies vía createClient), y si es invitación a una empresa
// crea la membresía y la deja activa. Usar redirect() de next/navigation hace
// que las cookies de sesión persistan en la redirección.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (!token_hash || !type) redirect("/login?error=enlace_invalido");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) redirect("/login?error=enlace_invalido");

  // ¿Invitación a una empresa? (metadata puesta al invitar)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const orgId = (user?.user_metadata?.invite_org_id as string) || null;

  if (user && orgId) {
    const admin = createAdminClient();
    const { data: existe } = await admin
      .from("miembro")
      .select("id")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!existe) {
      await admin.from("miembro").insert({
        org_id: orgId,
        user_id: user.id,
        nombre: (user.user_metadata?.nombre as string) || user.email,
        rol: (user.user_metadata?.invite_rol as string) || "colaborador",
      });
    }
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, invite_org_id: null },
    });
    const cookieStore = await cookies();
    cookieStore.set(ORG_COOKIE, orgId, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  }

  redirect(next);
}
