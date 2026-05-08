import type { SupabaseClient } from "@supabase/supabase-js";

import { preferredThumbnailUrl } from "@/lib/inventario-media";
import type { InventarioRow } from "@/lib/portal-types";

type LoteMini = {
  remate_id: string;
  orden: number;
  inventario_id: string | null;
};

/**
 * Para cada remate, toma el primer lote por `orden` con inventario y devuelve la URL de miniatura (misma prioridad que catálogo).
 */
export async function fetchRemateThumbnailMap(
  supabase: SupabaseClient,
  remateIds: string[],
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  if (!remateIds.length) return out;

  const { data: lotesData, error: e1 } = await supabase
    .from("portal_remate_lotes")
    .select("remate_id, orden, inventario_id")
    .in("remate_id", remateIds)
    .order("orden", { ascending: true });

  if (e1 || !lotesData?.length) return out;

  const lotes = lotesData as LoteMini[];
  const invFirst = new Map<string, string>();

  for (const row of lotes) {
    if (!row.remate_id || !row.inventario_id) continue;
    if (!invFirst.has(row.remate_id)) invFirst.set(row.remate_id, row.inventario_id);
  }

  const inventarioIds = [...new Set([...invFirst.values()])];
  if (!inventarioIds.length) return out;

  const { data: invRows, error: e2 } = await supabase.from("inventario").select("*").in("id", inventarioIds);

  if (e2 || !invRows?.length) return out;

  const thumbByInv = new Map<string, string | null>();
  for (const row of invRows as (InventarioRow & Record<string, unknown>)[]) {
    thumbByInv.set(row.id, preferredThumbnailUrl(row));
  }

  for (const remateId of remateIds) {
    const iid = invFirst.get(remateId);
    out[remateId] = iid ? thumbByInv.get(iid) ?? null : null;
  }

  return out;
}
