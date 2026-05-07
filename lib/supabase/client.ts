import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getPublicSupabaseEnv } from "./public-env";

let browserClient: SupabaseClient | undefined;

/** Cliente browser; `null` si faltan variables (no lanzar error: evita pantalla en blanco en Vercel). */
export function createClient(): SupabaseClient | null {
  const env = getPublicSupabaseEnv();
  if (!env) return null;
  if (!browserClient) {
    browserClient = createBrowserClient(env.url, env.key);
  }
  return browserClient;
}
