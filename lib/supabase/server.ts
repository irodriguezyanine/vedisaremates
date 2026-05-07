import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getPublicSupabaseEnv } from "./public-env";

/** Cliente servidor; `null` si faltan variables públicas de Supabase. */
export async function createClient(): Promise<SupabaseClient | null> {
  const env = getPublicSupabaseEnv();
  if (!env) return null;

  const cookieStore = await cookies();

  return createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          /* set desde Server Component: ignorar */
        }
      },
    },
  });
}
