export function getPublicSupabaseEnv(): { url: string; key: string } | null {
  const url =
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").trim() || "";
  const key =
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "").trim() || "";
  if (!url || !key) return null;
  return { url, key };
}

export function isSupabaseConfigured(): boolean {
  return getPublicSupabaseEnv() !== null;
}
