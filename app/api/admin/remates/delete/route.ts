import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function authorizeAdmin() {
  const supabase = await createClient();
  if (!supabase) return { ok: false as const, status: 503 };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };
  const { data: profile } = await supabase.from("profiles").select("rol").eq("id", user.id).maybeSingle();
  const rol = String(profile?.rol ?? "").toLowerCase();
  if (!["admin", "sac"].includes(rol)) return { ok: false as const, status: 403 };
  return { ok: true as const };
}

export async function POST(req: Request) {
  const auth = await authorizeAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: auth.status });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Falta cliente admin." }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as { remateId?: string };
  const remateId = String(body.remateId ?? "").trim();
  if (!remateId) {
    return NextResponse.json({ ok: false, error: "Falta remateId." }, { status: 400 });
  }

  const { data: row, error: fetchError } = await admin
    .from("portal_remates")
    .select("id, tasaciones_remate_id")
    .eq("id", remateId)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }
  if (!row?.id) {
    return NextResponse.json({ ok: true, removed: false, reason: "not_found" });
  }

  let tasacionesRemateId = String(row.tasaciones_remate_id ?? "").trim();

  // Fallback para datos históricos: inferir vínculo Tasaciones desde lotes vinculados.
  if (!tasacionesRemateId) {
    const { data: linkedLote } = await admin
      .from("portal_remate_lotes")
      .select("tasaciones_remate_item_id")
      .eq("remate_id", remateId)
      .not("tasaciones_remate_item_id", "is", null)
      .limit(1)
      .maybeSingle<{ tasaciones_remate_item_id: string | null }>();
    const tasacionesItemId = String(linkedLote?.tasaciones_remate_item_id ?? "").trim();
    if (tasacionesItemId) {
      const { data: sharedItem } = await admin
        .from("remates_items")
        .select("remate_id")
        .eq("id", tasacionesItemId)
        .maybeSingle<{ remate_id: string | null }>();
      tasacionesRemateId = String(sharedItem?.remate_id ?? "").trim();
    }
  }

  // Si está vinculado a tablas compartidas, eliminamos primero esos registros.
  if (tasacionesRemateId) {
    const { error: delSharedItemsError } = await admin
      .from("remates_items")
      .delete()
      .eq("remate_id", tasacionesRemateId);
    if (delSharedItemsError) {
      return NextResponse.json(
        { ok: false, error: `No se pudieron eliminar items compartidos: ${delSharedItemsError.message}` },
        { status: 500 },
      );
    }

    const { error: delSharedRemateError } = await admin
      .from("remates")
      .delete()
      .eq("id", tasacionesRemateId);
    if (delSharedRemateError) {
      return NextResponse.json(
        { ok: false, error: `No se pudo eliminar remate compartido: ${delSharedRemateError.message}` },
        { status: 500 },
      );
    }

    // Para superar trigger de protección en portal_remates, quitamos vínculo antes de eliminar en portal.
    const { error: unlinkError } = await admin
      .from("portal_remates")
      .update({ tasaciones_remate_id: null })
      .eq("id", remateId);
    if (unlinkError) {
      return NextResponse.json(
        { ok: false, error: `No se pudo desvincular remate portal: ${unlinkError.message}` },
        { status: 500 },
      );
    }
  }

  const { data: loteRows, error: lotesFetchError } = await admin
    .from("portal_remate_lotes")
    .select("id")
    .eq("remate_id", remateId);
  if (lotesFetchError) {
    return NextResponse.json({ ok: false, error: `No se pudieron consultar lotes: ${lotesFetchError.message}` }, { status: 500 });
  }
  const loteIds = (loteRows ?? []).map((row) => String(row.id ?? "")).filter(Boolean);
  if (loteIds.length) {
    const { error: deleteOffersError } = await admin.from("portal_ofertas").delete().in("lote_id", loteIds);
    if (deleteOffersError) {
      return NextResponse.json(
        { ok: false, error: `No se pudieron eliminar ofertas del remate: ${deleteOffersError.message}` },
        { status: 500 },
      );
    }
    const { error: deleteProxyError } = await admin.from("portal_proxy_bids").delete().in("lote_id", loteIds);
    if (deleteProxyError) {
      return NextResponse.json(
        { ok: false, error: `No se pudieron eliminar pujas automáticas: ${deleteProxyError.message}` },
        { status: 500 },
      );
    }
    const { error: deleteFavoritesError } = await admin.from("portal_lote_favoritos").delete().in("lote_id", loteIds);
    if (deleteFavoritesError) {
      return NextResponse.json(
        { ok: false, error: `No se pudieron eliminar favoritos vinculados: ${deleteFavoritesError.message}` },
        { status: 500 },
      );
    }
  }
  const { error: deleteLotesError } = await admin.from("portal_remate_lotes").delete().eq("remate_id", remateId);
  if (deleteLotesError) {
    return NextResponse.json(
      { ok: false, error: `No se pudieron eliminar lotes del remate: ${deleteLotesError.message}` },
      { status: 500 },
    );
  }
  const { error: deletePortalError } = await admin.from("portal_remates").delete().eq("id", remateId);
  if (deletePortalError) {
    return NextResponse.json(
      { ok: false, error: `No se pudo eliminar remate portal: ${deletePortalError.message}` },
      { status: 500 },
    );
  }

  await admin.rpc("portal_integracion_procesar_outbox", { p_limit: 120 });

  return NextResponse.json({ ok: true, removed: true });
}

