import { type NextRequest, NextResponse } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORG_COOKIE } from "@/lib/auth";

// Maneja el link del correo (invitación / magic link): verifica el token, crea
// la sesión, y si es una invitación a una empresa, crea la membresía y la deja
// activa. Aquí SÍ se pueden setear cookies (route handler).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (!token_hash || !type) {
    return NextResponse.redirect(`${origin}/login?error=enlace_invalido`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=enlace_invalido`);
  }

  // ¿Es una invitación a una empresa? (metadata puesta al invitar)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const orgId = (user?.user_metadata?.invite_org_id as string) || null;

  const res = NextResponse.redirect(`${origin}${next}`);

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
    // limpiar la invitación y dejar esa empresa como activa
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, invite_org_id: null },
    });
    res.cookies.set(ORG_COOKIE, orgId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return res;
}
