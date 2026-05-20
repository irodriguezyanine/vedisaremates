import Link from "next/link";
import { notFound } from "next/navigation";

import { AuctionLiveRoomClient } from "@/components/subastas/auction-live-room-client";
import { SupabaseDeployWarning } from "@/components/supabase-deploy-warning";
import type { InventarioRow, PortalRemateLoteRow, PortalRemateRow } from "@/lib/portal-types";
import { resolveAvaluoFiscalMonto } from "@/lib/tasaciones-avaluo-fiscal";
import { createClient } from "@/lib/supabase/server";

type LoteConInventario = PortalRemateLoteRow & {
  inventario: InventarioRow | null;
  avaluo_fiscal_monto: number | null;
  tasaciones_remate_item_id?: string | null;
};

type Props = {
  params: Promise<{ remateId: string }>;
  searchParams: Promise<{ lote?: string }>;
};

export default async function SubastaDetallePage({ params, searchParams }: Props) {
  const { remateId } = await params;
  const q = await searchParams;
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
  let viewerHasGarantia = false;
  if (user?.id) {
    const { data: profile } = await supabase.from("profiles").select("garantia_aprobada").eq("id", user.id).maybeSingle();
    viewerHasGarantia = profile?.garantia_aprobada === true;
  }

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

  const lotesFlat = ((lotesRows ?? []) as LoteConInventario[]) ?? [];
  const invIds = [...new Set(lotesFlat.map((l) => l.inventario_id).filter((x): x is string => Boolean(x)))];
  const tasacionesItemIds = [
    ...new Set(
      lotesFlat
        .map((l) => String((l as { tasaciones_remate_item_id?: string | null }).tasaciones_remate_item_id ?? "").trim())
        .filter(Boolean),
    ),
  ];

  const remateItemExtraById: Record<string, unknown> = {};
  if (tasacionesItemIds.length) {
    const { data: remateItems } = await supabase
      .from("remates_items")
      .select("id, extra_fields")
      .in("id", tasacionesItemIds);
    for (const row of (remateItems ?? []) as Array<{ id?: string; extra_fields?: unknown }>) {
      const id = String(row.id ?? "").trim();
      if (id) remateItemExtraById[id] = row.extra_fields ?? null;
    }
  }

  const invLookup: Record<string, InventarioRow> = {};
  if (invIds.length) {
    const { data: invs } = await supabase.from("inventario").select("*").in("id", invIds);
    for (const row of ((invs ?? []) as InventarioRow[]) ?? []) {
      if (row.id) invLookup[row.id] = row;
    }
  }

  const lotesEnriquecidos: LoteConInventario[] = lotesFlat.map((l) => {
    const inventario = l.inventario_id ? invLookup[l.inventario_id] ?? null : null;
    const tasacionesItemId = String(
      (l as { tasaciones_remate_item_id?: string | null }).tasaciones_remate_item_id ?? "",
    ).trim();
    const avaluo_fiscal_monto = resolveAvaluoFiscalMonto({
      remateItemExtraFields: tasacionesItemId ? remateItemExtraById[tasacionesItemId] : null,
      inventario: inventario as Record<string, unknown> | null,
    });
    return {
      ...l,
      inventario,
      avaluo_fiscal_monto,
    };
  });

  const { data: fichaCfgRow, error: fichaCfgErr } = await supabase
    .from("portal_inventario_ficha_config")
    .select("config")
    .eq("id", 1)
    .maybeSingle();

  let fichaDisplayConfig: unknown | null = null;
  if (!fichaCfgErr) {
    fichaDisplayConfig = (fichaCfgRow as { config?: unknown } | null)?.config ?? null;
  }

  const requestedLote = typeof q.lote === "string" ? q.lote.trim() : "";
  const initialActiveLoteId =
    requestedLote && lotesEnriquecidos.some((l) => l.id === requestedLote) ? requestedLote : null;

  return (
    <AuctionLiveRoomClient
      initialRemate={r}
      initialLotes={lotesEnriquecidos}
      viewerId={user?.id ?? null}
      viewerHasGarantia={viewerHasGarantia}
      fichaDisplayConfig={fichaDisplayConfig}
      initialActiveLoteId={initialActiveLoteId}
    />
  );
}
