import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { isDemo } from "@/lib/demo";

// Rutas públicas (no requieren sesión).
const PUBLIC_PATHS = ["/login", "/registro", "/inicio", "/auth"];

// Páginas de auth/marketing que no aplican con sesión activa → al tablero.
const SOLO_ANONIMO = ["/login", "/registro", "/inicio"];

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

  // En modo demo no hay sesión: login/registro/landing/onboarding no aplican → al tablero.
  if (isDemo()) {
    if (SOLO_ANONIMO.includes(path) || path === "/onboarding") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  // Sin cookies de Supabase no puede haber sesión: decide solo por ruta, sin
  // construir el cliente ni llamar a getUser() (la landing es el hot path).
  const tieneCookiesAuth = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-"));
  if (!tieneCookiesAuth) {
    return respuestaAnonima(request, path);
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

  // Los Set-Cookie acumulados en supabaseResponse (refresh o limpieza de la
  // sesión) deben viajar en CUALQUIER respuesta; si se descartan, el navegador
  // conserva cookies vencidas y repite el refresh en cada request.
  const conCookies = (res: NextResponse) => {
    supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (!user) {
    return conCookies(respuestaAnonima(request, path));
  }

  // Con sesión y en login/registro/landing → al tablero.
  if (SOLO_ANONIMO.includes(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return conCookies(NextResponse.redirect(url));
  }

  return supabaseResponse;
}

// Qué ve un visitante sin sesión: la landing en la raíz (solo GET — un POST a
// "/" es una server action con sesión vencida y debe ir al login), las rutas
// públicas tal cual, y el resto al login.
function respuestaAnonima(request: NextRequest, path: string) {
  if (path === "/" && request.method === "GET") {
    const url = request.nextUrl.clone();
    url.pathname = "/inicio";
    return NextResponse.rewrite(url, { request });
  }

  const isPublic = PUBLIC_PATHS.some(
    (p) => path === p || path.startsWith(p + "/"),
  );
  if (!isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}
