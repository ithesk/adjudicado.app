import { createBrowserClient } from "@supabase/ssr";

// Cliente para Client Components (browser).
// IMPORTANTE: referenciar process.env.NEXT_PUBLIC_* de forma LITERAL para que
// Next las inyecte en el bundle del navegador. Un acceso dinámico (process.env[name])
// no se inyecta y queda undefined en el cliente.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
