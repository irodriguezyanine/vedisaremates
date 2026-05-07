import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getPublicSupabaseEnv } from "@/lib/supabase/public-env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const env = getPublicSupabaseEnv();
  if (!env) {
    return supabaseResponse;
  }

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  await supabase.auth.getUser();

  return supabaseResponse;
}
