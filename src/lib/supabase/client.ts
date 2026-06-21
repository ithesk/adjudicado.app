import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

// Cliente para Client Components (browser).
export function createClient() {
  return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
}
