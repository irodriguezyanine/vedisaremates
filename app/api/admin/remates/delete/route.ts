import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function normalizeDigits(value: string) {
  return value.replace(/\D/g, "").replace(/^0+/, "");
}

function zeroPad(value: string, length: number) {
  return value.padStart(length, "0");
}

function extractRemateNumberFromTitle(title: string) {
  const m = title.match(/#\s*([0-9]+)/);
  if (!m?.[1]) return "";
  return normalizeDigits(m[1]);
}

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
    .select("id, tasaciones_remate_id, source_system, titulo, ends_at")
    .eq("id", remateId)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }
  if (!row?.id) {
    return NextResponse.json({ ok: true, removed: false, reason: "not_found" });
  }

  let tasacionesRemateId = String(row.tasaciones_remate_id ?? "").trim();
  const sourceSystem = String((row as { source_system?: string | null }).source_system ?? "").trim().toLowerCase();
  const remateTitle = String((row as { titulo?: string | null }).titulo ?? "");
  const remateEndsAt = String((row as { ends_at?: string | null }).ends_at ?? "");
  const remateNumberFromTitle = extractRemateNumberFromTitle(remateTitle);
  const looksLikeTasacionesByTitle = Boolean(remateNumberFromTitle);
  const isTasacionesSource = sourceSystem === "tasaciones" || looksLikeTasacionesByTitle;

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

  // Fallback adicional: inferir por número de remate cuando el vínculo directo no exista.
  if (!tasacionesRemateId && isTasacionesSource) {
    const remateNumber = remateNumberFromTitle;
    if (remateNumber) {
      const remateNumberPadded4 = zeroPad(remateNumber, 4);
      const remateNumberPadded5 = zeroPad(remateNumber, 5);
      const orExpr = [
        `numero_remate.eq.${remateNumber}`,
        `numero_remate.eq.${remateNumberPadded4}`,
        `numero_remate.eq.${remateNumberPadded5}`,
        `numero_remate.ilike.%${remateNumberPadded4}%`,
        `numero_remate.ilike.%${remateNumberPadded5}%`,
      ].join(",");

      let rematesCandidates: Array<{
        id: string | null;
        numero_remate: string | null;
        fecha_hora_remate: string | null;
      }> = [];

      const { data: rematesByNumber } = await admin
        .from("remates")
        .select("id, numero_remate, fecha_hora_remate")
        .or(orExpr)
        .limit(200);
      rematesCandidates = (rematesByNumber ?? []) as Array<{
        id: string | null;
        numero_remate: string | null;
        fecha_hora_remate: string | null;
      }>;

      if (!rematesCandidates.length) {
        const { data: rematesWide } = await admin
          .from("remates")
          .select("id, numero_remate, fecha_hora_remate")
          .order("created_at", { ascending: false })
          .limit(5000);
        rematesCandidates = (rematesWide ?? []) as Array<{
          id: string | null;
          numero_remate: string | null;
          fecha_hora_remate: string | null;
        }>;
      }

      const candidates = (rematesCandidates ?? []) as Array<{
        id: string | null;
        numero_remate: string | null;
        fecha_hora_remate: string | null;
      }>;
      const byNumber = candidates.find(
        (candidate) => normalizeDigits(String(candidate.numero_remate ?? "")) === remateNumber,
      );
      if (byNumber?.id) {
        tasacionesRemateId = String(byNumber.id);
      } else if (remateEndsAt) {
        const byDate = candidates.find((candidate) => {
          if (!candidate?.id || !candidate.fecha_hora_remate) return false;
          const a = new Date(candidate.fecha_hora_remate).getTime();
          const b = new Date(remateEndsAt).getTime();
          if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
          return Math.abs(a - b) <= 5 * 60 * 1000;
        });
        if (byDate?.id) tasacionesRemateId = String(byDate.id);
      }
    }
  }

  // Si viene de Tasaciones, impedir borrado parcial (si no, se reimporta al sincronizar).
  if (isTasacionesSource && !tasacionesRemateId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No se pudo resolver el vínculo con Tasaciones para este remate. No se elimina para evitar reaparición en la próxima sincronización.",
      },
      { status: 409 },
    );
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

  const { error: outboxError } = await admin.rpc("portal_integracion_procesar_outbox", { p_limit: 120 });
  if (outboxError) {
    return NextResponse.json(
      { ok: false, error: `Remate eliminado, pero falló procesamiento de outbox: ${outboxError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, removed: true });
}

