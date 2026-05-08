import Link from "next/link";
import { notFound } from "next/navigation";

import { AuctionLiveRoom } from "@/components/subastas/auction-live-room";
import { SupabaseDeployWarning } from "@/components/supabase-deploy-warning";
import type { InventarioRow, PortalRemateLoteRow, PortalRemateRow } from "@/lib/portal-types";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ remateId: string }> };

export default async function SubastaDetallePage({ params }: Props) {
  const { remateId } = await params;
  const supabase = await createClient();

  if (!supabase) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-14">
        <Link href="/subastas" className="text-sm font-semibold text-[#009ade] hover:underline">
          ← Sala de remates
        </Link>
        <SupabaseDeployWarning />
      </div>
    );
  }

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

  const { data: fichaCfgRow, error: fichaCfgErr } = await supabase
    .from("portal_inventario_ficha_config")
    .select("config")
    .eq("id", 1)
    .maybeSingle();

  let fichaDisplayConfig: unknown | null = null;
  if (!fichaCfgErr) {
    fichaDisplayConfig = (fichaCfgRow as { config?: unknown } | null)?.config ?? null;
  }
}
