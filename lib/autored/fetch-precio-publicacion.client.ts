import { createClient } from "@/lib/supabase/client";
import { getPublicSupabaseEnv } from "@/lib/supabase/public-env";
import { normalizarPatenteParaAutored } from "@/lib/autored/extract-inventario";

export type AutoredPrecioPublicacionResult = {
  ok: boolean;
  precio_publicacion: number | null;
  version: string | null;
  error?: string;
};

async function fetchDesdeEdgeFunction(patente: string): Promise<AutoredPrecioPublicacionResult> {
  const env = getPublicSupabaseEnv();
  if (!env) return { ok: false, precio_publicacion: null, version: null, error: "Sin Supabase" };

  const supabase = createClient();
  let bearer = env.key;
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) bearer = session.access_token;
  }

  const p = normalizarPatenteParaAutored(patente);
  const url = `${env.url}/functions/v1/autored-vehicle-info?licensePlate=${encodeURIComponent(p)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}`, apikey: env.key },
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* vacío */
  }
  if (!res.ok || typeof json.error === "string") {
    return {
      ok: false,
      precio_publicacion: null,
      version: null,
      error: typeof json.error === "string" ? json.error : `HTTP ${res.status}`,
    };
  }
  const precio =
    json.precio_publicacion != null && Number.isFinite(Number(json.precio_publicacion))
      ? Number(json.precio_publicacion)
      : null;
  const version = typeof json.version === "string" ? json.version.trim() || null : null;
  return { ok: precio != null, precio_publicacion: precio, version };
}

/** Precio de publicación Autored vía API del portal (con km); fallback a Edge Function compartida. */
export async function fetchPrecioPublicacionAutored(params: {
  patente: string;
  version?: string | null;
  kilometraje?: string | null;
}): Promise<AutoredPrecioPublicacionResult> {
  const patente = normalizarPatenteParaAutored(params.patente);
  if (patente.length < 5) {
    return { ok: false, precio_publicacion: null, version: null, error: "Patente inválida" };
  }

  const q = new URLSearchParams({ patente });
  if (params.version?.trim()) q.set("version", params.version.trim());
  if (params.kilometraje?.trim()) q.set("kilometraje", params.kilometraje.trim());

  try {
    const res = await fetch(`/api/vehiculos/autored-precio-publicacion?${q.toString()}`);
    const json = (await res.json()) as Record<string, unknown>;
    if (res.ok) {
      const precio =
        json.precio_publicacion != null && Number.isFinite(Number(json.precio_publicacion))
          ? Number(json.precio_publicacion)
          : null;
      const version =
        (typeof json.version === "string" ? json.version.trim() : null) ||
        params.version?.trim() ||
        null;
      return { ok: precio != null, precio_publicacion: precio, version };
    }
    if (res.status === 503) {
      return fetchDesdeEdgeFunction(patente);
    }
    return {
      ok: false,
      precio_publicacion: null,
      version: null,
      error: typeof json.error === "string" ? json.error : `HTTP ${res.status}`,
    };
  } catch (e) {
    const edge = await fetchDesdeEdgeFunction(patente);
    if (edge.ok) return edge;
    return {
      ok: false,
      precio_publicacion: null,
      version: null,
      error: e instanceof Error ? e.message : "Error de red",
    };
  }
}
