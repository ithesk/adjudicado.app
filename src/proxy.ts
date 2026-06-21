import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

// Next.js 16: el antiguo middleware.ts ahora es proxy.ts (export `proxy` + `proxyConfig`).
// Refresca la sesión de Supabase y protege rutas privadas.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const proxyConfig = {
  matcher: [
    // Todo excepto estáticos, imágenes y favicon.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
