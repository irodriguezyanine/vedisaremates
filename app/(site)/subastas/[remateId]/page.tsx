import { notFound } from "next/navigation";

import { AuctionLiveRoom } from "@/components/subastas/auction-live-room";
import type { InventarioRow, PortalRemateLoteRow, PortalRemateRow } from "@/lib/portal-types";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ remateId: string }> };

export default async function SubastaDetallePage({ params }: Props) {
  const { remateId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: remate, error: e1 } = await supabase.from("portal_remates").select("*").eq("id", remateId).single();

  if (e1 || !remate) {
    notFound();
  }

  const r = remate as PortalRemateRow;

  const { data: lotesRows } = await supabase
    .from("portal_remate_lotes")
    .select("*")
    .eq("remate_id", remateId)
    .order("orden", { ascending: true });

  const lotesFlat = ((lotesRows ?? []) as PortalRemateLoteRow[]) ?? [];
  const invIds = [...new Set(lotesFlat.map((l) => l.inventario_id).filter((x): x is string => Boolean(x)))];

  let invLookup: Record<string, InventarioRow> = {};
  if (invIds.length) {
    const { data: invs } = await supabase.from("inventario").select("*").in("id", invIds);
    for (const row of ((invs ?? []) as InventarioRow[]) ?? []) {
      if (row.id) invLookup[row.id] = row;
    }
  }

  const lotesEnriquecidos = lotesFlat.map((l) => ({
    ...l,
    inventario: l.inventario_id ? invLookup[l.inventario_id] ?? null : null,
  }));

  return (
    <AuctionLiveRoom initialRemate={r} initialLotes={lotesEnriquecidos} viewerId={user?.id ?? null} />
  );
}
