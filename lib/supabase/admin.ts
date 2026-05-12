import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null | undefined;

function getSupabaseAdminEnv(): { url: string; serviceRoleKey: string } | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

/**
 * Cliente admin para operaciones sensibles de Auth.
 * Requiere SUPABASE_SERVICE_ROLE_KEY en variables de entorno del servidor.
 */
export function createAdminClient(): SupabaseClient | null {
  if (adminClient !== undefined) return adminClient;
  const env = getSupabaseAdminEnv();
  if (!env) {
    adminClient = null;
    return adminClient;
  }
  adminClient = createClient(env.url, env.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  return adminClient;
}
