import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Cliente con service_role: ignora RLS. SOLO usar server-side y para
// operaciones controladas (bootstrap de organización/membresía).
export function createAdminClient() {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
