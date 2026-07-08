import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { isDemo } from "@/lib/demo";

// Rutas públicas (no requieren sesión): landing, registro, login y callbacks.
const PUBLIC_PATHS = ["/", "/registro", "/login", "/auth"];

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Nunca tocar estáticos ni assets de Next (si no, se redirige el CSS/JS al
  // login y la app sale sin estilos). El matcher debería excluirlos, pero este
  // guard lo garantiza pase lo que pase.
  if (
    path.startsWith("/_next/") ||
    path === "/favicon.ico" ||
    /\.(css|js|mjs|map|json|txt|xml|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot)$/i.test(
      path,
    )
  ) {
    return NextResponse.next({ request });
  }

  // En modo demo no hay sesión: la landing/login/onboarding no aplican → al tablero.
  if (isDemo()) {
    const p = request.nextUrl.pathname;
    if (p === "/" || p === "/login" || p === "/onboarding") {
      const url = request.nextUrl.clone();
      url.pathname = "/tablero";
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANTE: no metas lógica entre createServerClient y getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  // Sin sesión y ruta protegida → al login.
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Con sesión y en la landing o /login → directo al tablero.
  if (user && (path === "/" || path === "/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/tablero";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
