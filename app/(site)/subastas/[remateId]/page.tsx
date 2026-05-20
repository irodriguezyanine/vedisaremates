import Link from "next/link";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";

import { SupabaseDeployWarning } from "@/components/supabase-deploy-warning";
import type { InventarioRow, PortalRemateLoteRow, PortalRemateRow } from "@/lib/portal-types";
import { createClient } from "@/lib/supabase/server";

const AuctionLiveRoom = dynamic(
  () => import("@/components/subastas/auction-live-room").then((m) => m.AuctionLiveRoom),
  {
    ssr: false,
    loading: () => <div className="mx-auto max-w-6xl px-4 py-16 text-center text-neutral-500">Cargando sala…</div>,
  },
);

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

  const lotesFlat = ((lotesRows ?? []) as PortalRemateLoteRow[]) ?? [];
  const invIds = [...new Set(lotesFlat.map((l) => l.inventario_id).filter((x): x is string => Boolean(x)))];

  const invLookup: Record<string, InventarioRow> = {};
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

  const requestedLote = typeof q.lote === "string" ? q.lote.trim() : "";
  const initialActiveLoteId =
    requestedLote && lotesEnriquecidos.some((l) => l.id === requestedLote) ? requestedLote : null;

  return (
    <AuctionLiveRoom
      initialRemate={r}
      initialLotes={lotesEnriquecidos}
      viewerId={user?.id ?? null}
      viewerHasGarantia={viewerHasGarantia}
      fichaDisplayConfig={fichaDisplayConfig}
      initialActiveLoteId={initialActiveLoteId}
    />
  );
}
